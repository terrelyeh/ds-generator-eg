"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { layoutOptions, DEFAULT_LAYOUT } from "@/lib/project-datasheet/themes";

export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), customer: customer.trim(), layout }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      router.push(`/projects/${json.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button className="shrink-0">New project datasheet</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project datasheet</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pd-name">Name</Label>
            <Input
              id="pd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="EOR100 / EOR200 — MY convenience chain"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pd-customer">Customer</Label>
            <Input
              id="pd-customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Used in the PRELIMINARY notice"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pd-layout">Layout</Label>
            <select
              id="pd-layout"
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {layoutOptions().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
