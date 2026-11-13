"use client";

import type { InputHTMLAttributes } from "react";
import { useWorkspaceDraft } from "./workspace-provider";

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "checked" | "defaultChecked"
>;

export function DraftInput({
  draftKey,
  serverValue,
  ...props
}: InputProps & { draftKey: string; serverValue: string | number }) {
  const [value, setValue] = useWorkspaceDraft(draftKey, String(serverValue));
  return (
    <input
      {...props}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

export function DraftCheckbox({
  draftKey,
  serverChecked,
  ...props
}: InputProps & {
  draftKey: string;
  serverChecked: boolean;
  value: string | number;
}) {
  const [checked, setChecked] = useWorkspaceDraft(draftKey, serverChecked);
  return (
    <input
      {...props}
      type="checkbox"
      checked={checked}
      onChange={(event) => setChecked(event.target.checked)}
    />
  );
}
