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
    <div className="wa-home">
      <div className="wa-home__card">
        <div className="wa-home__header">
          <div className="wa-home__logo">Call</div>
          <div>
            <h1>WhatsApp-style Video Rooms</h1>
            <p>Create a private room or join with a key.</p>
          </div>
        </div>

        <div className="wa-home__actions">
          <button className="wa-btn wa-btn--primary" onClick={createRoom}>
            Create Room
          </button>
          <div className="wa-join">
            <input
              type="text"
              placeholder="Enter Room Key"
              value={roomKey}
              onChange={(e) => setRoomKey(e.target.value)}
            />
            <button className="wa-btn wa-btn--ghost" onClick={joinRoom}>
              Join Room
            </button>
          </div>
        </div>

        <div className="wa-home__hint">
          Tip: share the room key in WhatsApp to invite someone fast.
        </div>
      </div>
    </div>
  );
}
