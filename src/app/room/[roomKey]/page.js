"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import io from "socket.io-client";

const Room = () => {
  const { roomKey } = useParams();
  const socketRef = useRef();
  const localVideoRef = useRef();
  const remoteVideosRef = useRef({});
  const peerConnectionsRef = useRef({});
  const [localStream, setLocalStream] = useState(null);
  const [roomSize, setRoomSize] = useState(0);

  useEffect(() => {
    console.log("Room component mounted, connecting to socket...");
    socketRef.current = io('https://communication-backend-qza9.onrender.com');
    socketRef.current.emit('join-room', roomKey);

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        console.log('Successfully accessed media devices.');
        setLocalStream(stream);
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }
      })
      .catch(error => {
        console.error('Error accessing media devices.', error);
      });

    socketRef.current.on("other-users", (otherUsers) => {
      console.log("Received other-users event:", otherUsers);
      otherUsers.forEach((userId) => {
        createPeerConnection(userId, true);
      });
    });

    socketRef.current.on("user-joined", (userId) => {
      console.log("User joined:", userId);
      createPeerConnection(userId, false);
    });

    socketRef.current.on("offer", async (payload) => {
      console.log("Received offer from:", payload.callerId);
      const { callerId, sdp } = payload;
      const peerConnection = createPeerConnection(callerId, false);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socketRef.current.emit("answer", { target: callerId, sdp: answer });
    });

    socketRef.current.on("answer", async (payload) => {
      console.log("Received answer from:", payload.callerId);
      const { callerId, sdp } = payload;
      const peerConnection = peerConnectionsRef.current[callerId];
      if (peerConnection) {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(sdp),
        );
      }
    });

    socketRef.current.on("ice-candidate", (payload) => {
      console.log("Received ICE candidate from:", payload.callerId);
      const { callerId, candidate } = payload;
      const peerConnection = peerConnectionsRef.current[callerId];
      if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socketRef.current.on("user-left", (userId) => {
      console.log("User left:", userId);
      if (peerConnectionsRef.current[userId]) {
        peerConnectionsRef.current[userId].close();
        delete peerConnectionsRef.current[userId];
      }
      const remoteVideo = document.getElementById(`remote-video-${userId}`);
      if (remoteVideo) {
        remoteVideo.remove();
      }
    });

    socketRef.current.on("room-size", (size) => {
      console.log("Received room size:", size);
      setRoomSize(size);
    });

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomKey]);

  const createPeerConnection = (userId, isInitiator) => {
    console.log(
      `Creating peer connection for user: ${userId}, initiator: ${isInitiator}`,
    );
    if (peerConnectionsRef.current[userId]) {
      return peerConnectionsRef.current[userId];
    }
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });
    }

    peerConnection.ontrack = (event) => {
      const remoteVideoContainer = document.getElementById("remote-videos");
      let video = document.getElementById(`remote-video-${userId}`);
      if (!video) {
        video = document.createElement("video");
        video.id = `remote-video-${userId}`;
        video.autoplay = true;
        video.playsInline = true;
        remoteVideoContainer.appendChild(video);
      }
      video.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", {
          target: userId,
          candidate: event.candidate,
        });
      }
    };

    if (isInitiator) {
      (async () => {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socketRef.current.emit("offer", { target: userId, sdp: offer });
      })();
    }

    peerConnectionsRef.current[userId] = peerConnection;
    return peerConnection;
  };

  return (
    <div
      style={{
        padding: "20px",
        backgroundColor: "#f0f0f0",
        minHeight: "100vh",
      }}
    >
      <h1>Room: {roomKey}</h1>
      <h2>People in call: {roomSize}</h2>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <div>
          <h2>Your Video</h2>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "300px", border: "1px solid black" }}
          />
        </div>
        <div
          id="remote-videos"
          style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
        >
          <h2>Remote Videos</h2>
        </div>
      </div>
    </div>
  );
};

export default Room;
