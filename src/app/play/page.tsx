import { GuestJoinForm } from "@/features/live/guest-join-form";

export default async function PlayPage({
  searchParams,
}: PageProps<"/play">) {
  const { code } = await searchParams;
  const initialCode = Array.isArray(code) ? code[0] : code;

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
      <GuestJoinForm initialCode={initialCode} />
    </main>
  );
}
