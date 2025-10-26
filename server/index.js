const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const wrtc = require("wrtc");
const { spawn } = require("child_process");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let peers = {};

io.on("connection", async (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("offer", async (offer) => {
    console.log("on offer");

    const pc = new wrtc.RTCPeerConnection({
//      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    // ---- Webカメラ映像をffmpegで取得 ----
    console.log("ffmpeg start");
    const ffmpeg = spawn("ffmpeg", [
      "-f", "v4l2",
//      "-input_format", "yuyv422",
      "-input_format", "mjpeg",
      "-framerate", "33",
      "-video_size", "320x240",
//      "-c:v", "rawvideo", // 明示的に生ビデオ
      "-i", "/dev/video0",
      "-pix_fmt", "yuv420p",
//      "-vf", "format=yuv420p", // 明示的に YUV420p を保証
      "-f", "rawvideo",
      "pipe:1"
    ]);


    const { RTCVideoSource } = wrtc.nonstandard;
    const videoSource = new RTCVideoSource();
    const track = videoSource.createTrack();
    pc.addTrack(track);

    const frameSize = (320 * 240 * 3) / 2; // YUV420p
    let frameBuffer = Buffer.alloc(0);

    ffmpeg.stdout.on("data", (chunk) => {
      console.log("ffmpeg stdout: Received chunk size:", chunk.length);
      frameBuffer = Buffer.concat([frameBuffer, chunk]);
      console.log("frameBuffer size:", frameBuffer.length);
      while (frameBuffer.length >= frameSize) {
        const frame = frameBuffer.slice(0, frameSize);
        console.log("Frame size before sending:", frame.length);
        if (frame.length !== frameSize) {
          console.error("Invalid frame size:", frame.length, "expected:", frameSize);
          frameBuffer = frameBuffer.slice(frameSize);
          return; // スキップして次のチャンクを待つ
        }
        frameBuffer = frameBuffer.slice(frameSize);
        console.log("Sending frame of size:", frame.length);
        try {
          videoSource.onFrame({
            width: 320,
            height: 240,
            data: new Uint8Array(frame), // Buffer を Uint8Array に変換
          });
        } catch (e) {
          console.error("onFrame error:", e.message);
        }
      }
    });


    ffmpeg.stderr.on("data", (data) => {
      // ffmpegログ
      console.error("ffmpeg err:", data.toString());
    });

    ffmpeg.on("close", (code) => {
      console.log("ffmpeg exited with code", code);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE state:", pc.iceConnectionState);
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", pc.localDescription);
    peers[socket.id] = pc;
  });

  socket.on("ice-candidate", async (candidate) => {
    const pc = peers[socket.id];
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  });

  socket.on("disconnect", () => {
    const pc = peers[socket.id];
    if (pc) {
      pc.close();
      delete peers[socket.id];
    }
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

