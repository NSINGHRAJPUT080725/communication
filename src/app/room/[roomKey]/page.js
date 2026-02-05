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
  const [remoteStreams, setRemoteStreams] = useState({});

  useEffect(() => {
    console.log("Room component mounted, connecting to socket...");
    socketRef.current = io('https://communication-backend-qza9.onrender.com');
    
    // Set up socket listeners first
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
      setRemoteStreams(prev => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
    });

    socketRef.current.on("room-size", (size) => {
      console.log("Received room size:", size);
      setRoomSize(size);
    });

    // Join room after setting up listeners
    socketRef.current.emit('join-room', roomKey);

    // Get media with fallback options
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log('Successfully accessed video and audio.');
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.warn('Failed to get video and audio, trying video only:', error);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          console.log('Successfully accessed video only.');
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } catch (videoError) {
          console.warn('Failed to get video, trying audio only:', videoError);
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            console.log('Successfully accessed audio only.');
            setLocalStream(stream);
          } catch (audioError) {
            console.error('Failed to access any media devices:', audioError);
          }
        }
      }
    };

    getMedia();

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

    // Add local stream tracks if available
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        console.log(`Adding ${track.kind} track to peer connection`);
        peerConnection.addTrack(track, localStream);
      });
    }

    peerConnection.ontrack = (event) => {
      console.log(`Received remote stream from user: ${userId}`);
      setRemoteStreams(prev => ({
        ...prev,
        [userId]: event.streams[0]
      }));
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", {
          target: userId,
          candidate: event.candidate,
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for ${userId}:`, peerConnection.connectionState);
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
        <div>
          <h2>Remote Videos</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {Object.entries(remoteStreams).map(([userId, stream]) => (
              <video
                key={userId}
                autoPlay
                playsInline
                ref={(video) => {
                  if (video && stream) {
                    video.srcObject = stream;
                  }
                }}
                style={{ width: "300px", border: "1px solid black" }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Room;
