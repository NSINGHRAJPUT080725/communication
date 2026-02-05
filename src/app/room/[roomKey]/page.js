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
  const localStreamRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [roomSize, setRoomSize] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState({});

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (!roomKey) {
      return;
    }

    console.log("Room component mounted, connecting to socket...");
    socketRef.current = io("https://communication-backend-qza9.onrender.com");
    
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
      console.log(`Sending answer to ${callerId}`);
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
      console.log("Received ICE candidate from:", payload.callerId, payload.candidate);
      const { callerId, candidate } = payload;
      const peerConnection = peerConnectionsRef.current[callerId];
      if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          .then(() => console.log(`Added ICE candidate for ${callerId}`))
          .catch(err => console.error(`Failed to add ICE candidate for ${callerId}:`, err));
      } else {
        console.warn(`No peer connection found for ${callerId} when adding ICE candidate`);
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

    // Get media with fallback options, then join the room
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log('Successfully accessed video and audio.');
        localStreamRef.current = stream;
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        return stream;
      } catch (error) {
        console.warn('Failed to get video and audio, trying video only:', error);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          console.log('Successfully accessed video only.');
          localStreamRef.current = stream;
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          return stream;
        } catch (videoError) {
          console.warn('Failed to get video, trying audio only:', videoError);
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            console.log('Successfully accessed audio only.');
            localStreamRef.current = stream;
            setLocalStream(stream);
            return stream;
          } catch (audioError) {
            console.error('Failed to access any media devices:', audioError);
          }
        }
      }
    };

    (async () => {
      await getMedia();
      console.log("Joining room after media setup:", roomKey);
      socketRef.current.emit("join-room", roomKey);
    })();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
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
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`Adding ${track.kind} track to peer connection for user ${userId}`);
        peerConnection.addTrack(track, localStreamRef.current);
      });
    } else {
      console.log(`No local stream available when creating connection for user ${userId}`);
    }

    peerConnection.ontrack = (event) => {
      console.log(`Received remote stream from user: ${userId}`, event.streams[0]);
      setRemoteStreams(prev => ({
        ...prev,
        [userId]: event.streams[0]
      }));
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${userId}:`, event.candidate);
        socketRef.current.emit("ice-candidate", {
          target: userId,
          candidate: event.candidate,
        });
      } else {
        console.log(`ICE gathering complete for ${userId}`);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for ${userId}:`, peerConnection.connectionState);
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${userId}:`, peerConnection.iceConnectionState);
    };

    if (isInitiator) {
      console.log(`Creating offer for user ${userId}`);
      (async () => {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log(`Sending offer to user ${userId}`);
        socketRef.current.emit("offer", { target: userId, sdp: offer });
      })();
    }

    peerConnectionsRef.current[userId] = peerConnection;
    return peerConnection;
  };

  return (
    <div className="wa-room">
      <header className="wa-topbar">
        <div className="wa-topbar__left">
          <div className="wa-avatar" aria-hidden="true" />
          <div>
            <div className="wa-title">Room {roomKey}</div>
            <div className="wa-subtitle">{roomSize} in call</div>
          </div>
        </div>
        <div className="wa-topbar__right">
          <span className="wa-pill">Secure</span>
        </div>
      </header>

      <main className="wa-stage">
        <div className="wa-remote-grid">
          {Object.entries(remoteStreams).length === 0 ? (
            <div className="wa-empty">
              Waiting for others to join...
            </div>
          ) : (
            Object.entries(remoteStreams).map(([userId, stream]) => (
              <div key={userId} className="wa-tile">
                <video
                  autoPlay
                  playsInline
                  ref={(video) => {
                    if (video && stream) {
                      video.srcObject = stream;
                    }
                  }}
                />
                <div className="wa-tile__label">Participant</div>
              </div>
            ))
          )}
        </div>

        <div className="wa-local-pip">
          {localStream ? (
            <video ref={localVideoRef} autoPlay playsInline muted />
          ) : (
            <div className="wa-no-camera">No Camera</div>
          )}
          <div className="wa-tile__label">You</div>
        </div>
      </main>

      <footer className="wa-controls">
        <button className="wa-btn wa-btn--muted" type="button">Mute</button>
        <button className="wa-btn wa-btn--hangup" type="button">End</button>
        <button className="wa-btn wa-btn--video" type="button">Video</button>
      </footer>
    </div>
  );
};

export default Room;
