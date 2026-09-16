import Link from "next/link";
import { redirect } from "next/navigation";

import { canManageUsers, currentUser } from "@/lib/auth/auth-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ToolsPortalPage() {
  const user = await currentUser();

  if (!user) redirect("/login");

  const firstName = user.displayName.split(/\s+/)[0] || user.displayName;
  const userContext = [
    user.mediaHouseName,
    user.editorialUnitName,
    user.teamName,
    user.poolName,
  ].filter((value): value is string => Boolean(value));
  const portalTools = [
    ...user.tools.map((tool) => ({
      ...tool,
      signal: "Research & Analysis",
    })),
    {
      id: "flightracker",
      name: "Flightracker",
      href: "/flightracker",
      status: "active",
      description:
        "Live-Flugradar mit Flugzeugmodellen, aufgezeichneter Strecke und exportierbarem PDF-Bericht.",
      signal: "Live Intelligence",
    },
    ...(canManageUsers(user)
      ? [
          {
            id: "admin_console",
            name: "Admin Console",
            href: "/admin",
            status: "active",
            description:
              "Open user management, newsroom/team quotas, API usage, alerts, training and system admin tools.",
            signal: "Admin",
          },
        ]
      : []),
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[#e9ff18] text-[#10140f]">
      <section className="relative min-h-screen px-6 py-8 sm:px-10 lg:px-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.78),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(16,20,15,0.12),transparent_24%),linear-gradient(135deg,rgba(16,20,15,0.08),transparent_52%)]" />
        <div className="absolute bottom-0 right-0 h-[48vw] max-h-[560px] min-h-[300px] w-[48vw] min-w-[300px] max-w-[560px] opacity-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/factjack/factjack-parrot.png"
            alt=""
            className="h-full w-full object-contain"
          />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col">
          <header className="flex items-center justify-between gap-6">
            <Link href="/" className="block w-48 sm:w-60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/factjack/factjack-logo.jpg"
                alt="FactJack"
                className="h-auto w-full"
              />
            </Link>
            <form action="/api/auth/logout" method="post">
              <button className="rounded-full border-2 border-[#10140f] px-4 py-2 text-sm font-black uppercase tracking-[0.12em] transition hover:bg-[#10140f] hover:text-[#e9ff18]">
                Logout
              </button>
            </form>
          </header>

          <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
            <section>
              <div className="mb-5 inline-flex rounded-full border-2 border-[#10140f] px-4 py-2 text-xs font-black uppercase tracking-[0.18em]">
                Tools.factjack.org
              </div>
              <h1 className="max-w-3xl text-5xl font-black uppercase leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl">
                <span className="mb-3 inline bg-[linear-gradient(180deg,transparent_10%,rgba(255,255,255,0)_10%,rgba(255,255,255,0)_52%,#ffffff_52%,#ffffff_88%,rgba(255,255,255,0)_88%)] px-1 box-decoration-clone">
                  Hello <span className="text-[#df3131]">{firstName}</span>.
                </span>{" "}
                More facts. Less noise.
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-[#26301f]">
                Signed in as {user.displayName}. Your portal shows the tools
                configured for your newsroom role and organisation.
              </p>
              {userContext.length > 0 ? (
                <div className="mt-5 flex max-w-2xl flex-wrap gap-2">
                  {userContext.map((item) => (
                    <span
                      key={item}
                      className="border-2 border-[#10140f] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.1em]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-8 inline-flex items-center gap-4 border-2 border-[#10140f] bg-white px-4 py-3 shadow-[6px_6px_0_#10140f]">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#4a5a17]">
                  Licensed for
                </span>
                {user.mediaHouseLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.mediaHouseLogoUrl}
                    alt={user.mediaHouseName ?? "Licensed organisation"}
                    className="max-h-10 max-w-36 object-contain"
                  />
                ) : (
                  <span className="text-sm font-black uppercase">
                    {user.mediaHouseName ?? "FactJack"}
                  </span>
                )}
              </div>
            </section>

            <section className="grid gap-4">
              <div className="mb-1 text-sm font-black uppercase tracking-[0.22em] text-[#26301f]">
                Your Tools
              </div>
              {portalTools.map((tool) => (
                <Link
                  key={tool.id}
                  href={tool.href}
                  className="group border-2 border-[#10140f] bg-white p-6 shadow-[8px_8px_0_#10140f] transition hover:-translate-y-1 hover:shadow-[12px_12px_0_#10140f]"
                >
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-[#4a5a17]">
                        {tool.signal}
                      </div>
                      <h2 className="mt-2 text-3xl font-black uppercase">
                        {tool.name}
                      </h2>
                    </div>
                    <span className="rounded-full bg-[#e9ff18] px-3 py-1 text-xs font-black uppercase">
                      {tool.status}
                    </span>
                  </div>
                  <p className="mt-5 max-w-xl text-sm font-semibold leading-6 text-slate-700">
                    {tool.description}
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em]">
                    Open tool
                    <span className="transition group-hover:translate-x-1">
                      -&gt;
                    </span>
                  </div>
                </Link>
              ))}
            </section>
          </div>

          <footer className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#10140f]/20 py-4 text-xs font-bold uppercase tracking-[0.16em] text-[#26301f]">
            <span>{user.displayName}</span>
            <span>
              {[user.mediaHouseName, user.editorialUnitName, user.teamName, user.role]
                .filter((value): value is string => Boolean(value))
                .join(" · ") || "FactJack"}
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}
