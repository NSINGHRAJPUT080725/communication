"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [roomKey, setRoomKey] = useState("");
  const router = useRouter();

  const createRoom = () => {
    const newRoomKey = Math.random().toString(36).substring(2, 7);
    console.log(`Creating and joining room: ${newRoomKey}`);
    router.push(`/room/${newRoomKey}`);
  };

  const joinRoom = () => {
    if (roomKey) {
      console.log(`Joining room: ${roomKey}`);
      router.push(`/room/${roomKey}`);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        backgroundColor: "#f0f0f0",
        minHeight: "100vh",
      }}
    >
      <h1>Audio/Video Calling Applications</h1>
      <div>
        <button onClick={createRoom}>Create Room</button>
      </div>
      <div style={{ marginTop: "20px" }}>
        <input
          type="text"
          placeholder="Enter Room Key"
          value={roomKey}
          onChange={(e) => setRoomKey(e.target.value)}
        />
        <button onClick={joinRoom}>Join Room</button>
      </div>
    </div>
  );
}
