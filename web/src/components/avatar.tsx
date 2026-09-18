"use client";
import { useEffect, useState } from "react";
import type { Member, TripEvent } from "@/lib/models";
import { TravelSticker } from "./travel-sticker";

export function Avatar({
  member,
  className = "",
}: {
  member:
    | Pick<Member, "id" | "name" | "has_avatar" | "default_avatar" | "version">
    | undefined;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [member?.id, member?.version]);
  return (
    <span className={`avatar ${className}`}>
      {member && member.has_avatar && !failed ? (
        // Private Worker images require the same-origin session cookie.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/avatars/${encodeURIComponent(member.id)}?v=${member.version ?? 0}`}
          alt={`${member.name}的头像`}
          width={96}
          height={96}
          onError={() => setFailed(true)}
          draggable={false}
        />
      ) : member?.default_avatar ? (
        <span className="avatar-default-sticker" aria-label={member.name}>
          <TravelSticker kind={member.default_avatar as TripEvent["kind"]} />
        </span>
      ) : (
        <span aria-label={member?.name ?? "成员"}>
          {member?.name.slice(0, 1) ?? "?"}
        </span>
      )}
    </span>
  );
}
