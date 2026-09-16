import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth/auth-store";

export default async function FlightrackerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/flightracker");
  return children;
}
