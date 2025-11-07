"use client";

import { useRef, useState, useEffect } from 'react';
import VideoGenerator from "@/components/VideoGenerator";

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="container vstack" style={{ gap: 20 }}>
      <h1>Video Generator</h1>
      <p>Create short, animated videos directly in your browser. No server required.</p>

      <div className="card">
        {mounted && <VideoGenerator />}
        {!mounted && <p>Loading?</p>}
      </div>

      <footer className="small">Built for fast browser-based video creation.</footer>
    </div>
  );
}
