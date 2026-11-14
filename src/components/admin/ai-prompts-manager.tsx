"use client";

import {
  createAdminAiPrompt,
  deleteAdminAiPrompt,
  moveAdminAiPrompt,
  restoreDefaultAdminAiPrompts,
  setAdminAiPromptActive,
  updateAdminAiPrompt,
} from "@/app/admin/ai-prompts/actions";
import { useAdminLocale } from "@/components/admin/admin-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  promptChipLabel,
  type RestaurantAiPrompt,
} from "@/lib/restaurant-ai-prompts-shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EMPTY_DRAFT = { icon: "", label: "", queryText: "" };

export function AiPromptsManager({
  prompts,
  tableReady,
}: {
  prompts: RestaurantAiPrompt[];
  tableReady: boolean;
}) {
  const { t } = useAdminLocale();
  const router = useRouter();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(task: () => Promise<{ error?: string | null }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await task();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError(t.aiChipSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: RestaurantAiPrompt) {
    setEditingId(row.id);
    setEdit({ icon: row.icon, label: row.label, queryText: row.queryText });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.aiChips}</CardTitle>
        <CardDescription>{t.aiChipsSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!tableReady ? (
          <p className="text-muted-foreground text-sm">{t.aiChipMigration}</p>
        ) : null}

        <form
          className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[72px_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData();
            form.set("icon", draft.icon);
            form.set("label", draft.label);
            form.set("query_text", draft.queryText);
            void run(async () => {
              const result = await createAdminAiPrompt(form);
              if (!result.error) setDraft(EMPTY_DRAFT);
              return result;
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="ai-chip-icon">{t.aiChipIcon}</Label>
            <Input
              id="ai-chip-icon"
              value={draft.icon}
              onChange={(event) =>
                setDraft((current) => ({ ...current, icon: event.target.value }))
              }
              placeholder="🍷"
              maxLength={16}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ai-chip-label">{t.aiChipLabel}</Label>
            <Input
              id="ai-chip-label"
              value={draft.label}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
              placeholder={t.aiChipLabelPlaceholder}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="ai-chip-query">{t.aiChipQuery}</Label>
            <Textarea
              id="ai-chip-query"
              value={draft.queryText}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  queryText: event.target.value,
                }))
              }
              placeholder={t.aiChipQueryPlaceholder}
              maxLength={500}
              required
            />
          </div>
          <div className="flex items-end sm:col-span-3">
            <Button type="submit" disabled={busy || !tableReady}>
              {t.aiChipAdd}
            </Button>
          </div>
        </form>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="space-y-2">
          {prompts.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.aiChipEmpty}</p>
          ) : (
            prompts.map((row, index) => {
              const editing = editingId === row.id;
              return (
                <div
                  key={row.id}
                  className="space-y-3 rounded-xl border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={row.isActive ? "default" : "outline"}>
                      {promptChipLabel(row)}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {row.isActive ? t.aiChipShown : t.aiChipHidden}
                    </span>
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                      <Switch
                        checked={row.isActive}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                          void run(() =>
                            setAdminAiPromptActive(row.id, Boolean(checked)),
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy || index === 0}
                        onClick={() =>
                          void run(() => moveAdminAiPrompt(row.id, "up"))
                        }
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy || index === prompts.length - 1}
                        onClick={() =>
                          void run(() => moveAdminAiPrompt(row.id, "down"))
                        }
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          editing ? setEditingId(null) : startEdit(row)
                        }
                      >
                        {editing ? t.cancelEdit : t.edit}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(t.aiChipDeleteConfirm)) return;
                          void run(() => deleteAdminAiPrompt(row.id));
                        }}
                      >
                        {t.delete}
                      </Button>
                    </div>
                  </div>
                  {editing ? (
                    <form
                      className="grid gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData();
                        form.set("id", row.id);
                        form.set("icon", edit.icon);
                        form.set("label", edit.label);
                        form.set("query_text", edit.queryText);
                        form.set("is_active", row.isActive ? "true" : "false");
                        form.set("sort_order", String(row.sortOrder));
                        void run(async () => {
                          const result = await updateAdminAiPrompt(form);
                          if (!result.error) setEditingId(null);
                          return result;
                        });
                      }}
                    >
                      <div className="grid gap-2 sm:grid-cols-[72px_1fr]">
                        <Input
                          value={edit.icon}
                          onChange={(event) =>
                            setEdit((current) => ({
                              ...current,
                              icon: event.target.value,
                            }))
                          }
                          maxLength={16}
                        />
                        <Input
                          value={edit.label}
                          onChange={(event) =>
                            setEdit((current) => ({
                              ...current,
                              label: event.target.value,
                            }))
                          }
                          maxLength={80}
                          required
                        />
                      </div>
                      <Textarea
                        value={edit.queryText}
                        onChange={(event) =>
                          setEdit((current) => ({
                            ...current,
                            queryText: event.target.value,
                          }))
                        }
                        maxLength={500}
                        required
                      />
                      <div>
                        <Button type="submit" size="sm" disabled={busy}>
                          {t.saveChanges}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {row.queryText}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={busy || !tableReady}
          onClick={() => {
            if (!window.confirm(t.aiChipRestoreConfirm)) return;
            void run(() => restoreDefaultAdminAiPrompts());
          }}
        >
          {t.aiChipRestore}
        </Button>
      </CardContent>
    </Card>
  );
}
