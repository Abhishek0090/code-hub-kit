import { notFound } from "next/navigation";
import { Suspense } from "react";
import CodeshareRoom from "@/components/CodeshareRoomClient";
import { ROOM_ID } from "@/lib/codeshare";

async function Room({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  if (!ROOM_ID.test(room)) notFound();
  return <CodeshareRoom room={room} />;
}

/** The room id comes from the URL, so it streams in behind Suspense while the dashboard shell prerenders. */
export default function RoomPage({ params }: PageProps<"/codeshare/[room]">) {
  return (
    <Suspense fallback={<p className="px-7 py-6 text-sm text-zinc-500">Opening room...</p>}>
      <Room params={params} />
    </Suspense>
  );
}
