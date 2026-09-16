import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Flighttracker",
  description: "Live-Flugradar und PDF-Flugberichte im FactJack Tool Portal.",
};

export default function FlighttrackerPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#10140f] text-white">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#10140f] bg-[#e9ff18] px-5 py-4 text-[#10140f] sm:px-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="border-2 border-[#10140f] bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] shadow-[3px_3px_0_#10140f] transition hover:-translate-y-0.5"
          >
            &larr; Tool Portal
          </Link>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#4a5a17]">
              FactJack Live Intelligence
            </div>
            <h1 className="text-2xl font-black uppercase leading-none sm:text-3xl">
              Flighttracker
            </h1>
          </div>
        </div>
        <div className="border-2 border-[#10140f] bg-[#10140f] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#e9ff18]">
          Live · adsb.fi
        </div>
      </header>

      <section className="min-h-0 flex-1 bg-[#061017]">
        <iframe
          src="https://handl08.github.io/flighttracker/"
          title="Flighttracker Live-Radar"
          className="block h-[calc(100vh-82px)] min-h-[720px] w-full border-0"
          allow="geolocation"
        />
      </section>
    </main>
  );
}
