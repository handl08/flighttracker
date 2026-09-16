"use client";

import { useCallback, useRef } from "react";

export function FlighttrackerFrame({
  user,
  organisation,
}: {
  user: string;
  organisation: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const sendLicense = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      { type: "flighttracker-license", user, organisation },
      "https://handl08.github.io",
    );
  }, [user, organisation]);

  return (
    <iframe
      ref={frame}
      src="https://handl08.github.io/flighttracker/"
      title="Flighttracker Live-Radar"
      className="block h-[calc(100vh-82px)] min-h-[720px] w-full border-0"
      allow="geolocation"
      onLoad={sendLicense}
    />
  );
}
