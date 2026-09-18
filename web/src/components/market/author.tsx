"use client";
import { useState } from "react";
import type { PublicAuthor } from "../../../../shared/market";
export function MarketAuthor({ author }: { author: PublicAuthor }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="market-author">
      {author.avatar && !failed ? (
        <img
          className="market-author-avatar"
          src={author.avatar}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="market-author-avatar" aria-hidden="true">
          {Array.from(author.name)[0]}
        </span>
      )}
      <span>{author.name}</span>
    </span>
  );
}
