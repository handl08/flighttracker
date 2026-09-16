import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth/auth-store";

export default async function FlighttrackerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/flighttracker");
  return children;
}
