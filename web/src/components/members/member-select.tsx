"use client";
import { useState } from "react";
import { Check, ChevronDown, Users } from "lucide-react";
import type { Member } from "@/lib/models";
import { Avatar } from "../avatar";
import { Sheet } from "../ui";
export function MemberSelect({
  members,
  value,
  onChange,
  label,
  all = false,
  disabled = false,
  onAdd,
  stopEscapePropagation = false,
}: {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  all?: boolean;
  disabled?: boolean;
  onAdd?: () => void;
  stopEscapePropagation?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const member = members.find((m) => m.id === value);
  const options = all
    ? [{ id: "all", name: "全部成员", english_name: "" }, ...members]
    : members;
  return (
    <div className="member-select">
      <button
        type="button"
        className="member-select-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {member ? (
          <Avatar key={member.id} member={member} />
        ) : (
          <Users size={19} />
        )}
        <span>{member?.name ?? (value === "all" ? "全部成员" : "请选择")}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title={`选择${label}`}
          className="member-select-sheet"
          stopEscapePropagation={stopEscapePropagation}
        >
          <div
            className="member-select-list"
            role="listbox"
            aria-label={label}
            onKeyDown={(e) => {
              const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="option"]',
                ),
              );
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                e.key === "ArrowDown"
                  ? (index + 1) % buttons.length
                  : e.key === "ArrowUp"
                    ? (index - 1 + buttons.length) % buttons.length
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? buttons.length - 1
                        : -1;
              if (next >= 0) {
                e.preventDefault();
                buttons[next].focus();
              }
            }}
          >
            {options.map((m) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={value === m.id}
                aria-label={m.name}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                {m.id === "all" ? (
                  <span className="all-members-icon">
                    <Users size={22} />
                  </span>
                ) : (
                  <Avatar member={m} />
                )}
                <span>
                  {m.name}
                  {"status" in m && m.status === "placeholder" && (
                    <small className="unregistered-badge">未注册</small>
                  )}
                </span>
                {value === m.id && <Check size={18} />}
              </button>
            ))}
          </div>
          {onAdd && (
            <button
              type="button"
              className="add-companion-row"
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
            >
              ＋ 添加同伴（只填昵称，无需注册）
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}
