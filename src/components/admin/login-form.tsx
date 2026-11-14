"use client";

import {
  AdminLanguageSwitcher,
  AdminLocaleProvider,
  useAdminLocale,
} from "@/components/admin/admin-locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bindManagerTenant } from "@/app/admin/tenant-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/admin/password-field";
import { adminLandingPath, hardRedirectToAdmin } from "@/lib/login-redirect";
import { cn } from "cn";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type Mode = "signin" | "signup";

function firstQuery(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

function loginPropsFromSearchParams(query: {
  restaurant?: string | string[];
  slug?: string | string[];
  email?: string | string[];
  next?: string | string[];
}) {
  return {
    restaurantSlug: firstQuery(query.restaurant) || firstQuery(query.slug),
    invitedEmail: firstQuery(query.email),
    nextPath: firstQuery(query.next) || null,
  };
}

export function LoginScreen({
  initialMode = "signin",
  query,
}: {
  initialMode?: Mode;
  query?: {
    restaurant?: string | string[];
    slug?: string | string[];
    email?: string | string[];
    next?: string | string[];
  };
}) {
  const { restaurantSlug, invitedEmail, nextPath } =
    loginPropsFromSearchParams(query ?? {});
  return (
    <AdminLocaleProvider>
      <LoginScreenInner
        initialMode={initialMode}
        restaurantSlug={restaurantSlug}
        invitedEmail={invitedEmail}
        nextPath={nextPath}
      />
    </AdminLocaleProvider>
  );
}

function LoginScreenInner({
  initialMode,
  restaurantSlug,
  invitedEmail,
  nextPath,
}: {
  initialMode: Mode;
  restaurantSlug: string;
  invitedEmail: string;
  nextPath: string | null;
}) {
  const { t } = useAdminLocale();
  const [restaurantName, setRestaurantName] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantSlug) return;
    void createSupabaseBrowserClient()
      .from("restaurants")
      .select("name")
      .eq("slug", restaurantSlug)
      .maybeSingle()
      .then((result: { data: { name?: string | null } | null }) => {
        if (result.data?.name) setRestaurantName(String(result.data.name));
      });
  }, [restaurantSlug]);

  const heading = restaurantSlug
    ? `${t.loginForTenant}: ${restaurantName ?? restaurantSlug}`
    : t.loginTitle;

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex justify-end">
        <AdminLanguageSwitcher />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        {restaurantSlug ? null : (
          <p className="text-muted-foreground mt-1 text-sm">{t.loginHint}</p>
        )}
      </div>
      <LoginForm
        initialEmail={invitedEmail}
        initialMode={invitedEmail ? "signup" : initialMode}
        restaurantSlug={restaurantSlug}
        nextPath={nextPath}
      />
    </main>
  );
}

export function LoginForm({
  initialEmail = "",
  initialMode = "signin",
  restaurantSlug = "",
  nextPath = null,
}: {
  initialEmail?: string;
  initialMode?: Mode;
  restaurantSlug?: string;
  nextPath?: string | null;
}) {
  const { t } = useAdminLocale();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();
    void supabase.auth
      .getUser()
      .then((res: { data?: { user?: unknown } }) => {
        if (!active || !res.data?.user) return;
        setHasActiveSession(true);
        if (restaurantSlug) {
          void bindManagerTenant(restaurantSlug);
        }
      });
    return () => {
      active = false;
    };
  }, [restaurantSlug]);

  async function goToAdmin() {
    const fallback = adminLandingPath(email, nextPath);
    if (fallback === "/admin/super-admin") {
      void bindManagerTenant(restaurantSlug || null);
      hardRedirectToAdmin("/admin/super-admin");
      return;
    }

    try {
      const bound = await Promise.race([
        bindManagerTenant(restaurantSlug || null),
        new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), 2500);
        }),
      ]);
      if (bound?.isSuperAdmin) {
        hardRedirectToAdmin("/admin/super-admin");
        return;
      }
      const url =
        bound?.redirectTo && bound.redirectTo !== "/login"
          ? bound.redirectTo
          : fallback;
      hardRedirectToAdmin(url);
    } catch {
      hardRedirectToAdmin(fallback);
    }
  }

  async function signIn(supabase: ReturnType<typeof createSupabaseBrowserClient>) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(signInError.message);
      return false;
    }
    return true;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError(t.passwordsMismatch);
      return;
    }

    setPending(true);
    const supabase = createSupabaseBrowserClient();

    try {
      if (mode === "signin") {
        const ok = await signIn(supabase);
        if (ok) {
          setSuccess(t.signedIn);
          await goToAdmin();
        }
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpError) {
        const alreadyExists = /already|registered|exists/i.test(
          signUpError.message,
        );
        if (alreadyExists) {
          const signedInExisting = await signIn(supabase);
          if (signedInExisting) {
            setError(null);
            setSuccess(t.signedIn);
            await goToAdmin();
            return;
          }
          setMode("signin");
        }
        setError(alreadyExists ? t.alreadyExists : signUpError.message);
        return;
      }

      if (data.user?.identities && data.user.identities.length === 0) {
        const signedInExisting = await signIn(supabase);
        if (signedInExisting) {
          setError(null);
          setSuccess(t.signedIn);
          await goToAdmin();
          return;
        }
        setMode("signin");
        setError(t.alreadyExists);
        return;
      }

      if (data.session) {
        setSuccess(t.accountCreated);
        await goToAdmin();
        return;
      }

      const signedIn = await signIn(supabase);
      if (signedIn) {
        setSuccess(t.accountCreated);
        await goToAdmin();
        return;
      }

      setSuccess(t.confirmEmail);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {hasActiveSession ? (
        <div className="border-secondary/40 bg-muted/40 flex flex-col gap-2 rounded-xl border p-3 text-sm">
          <p className="text-muted-foreground">{t.alreadySignedInShare}</p>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void goToAdmin()}
          >
            {t.continueAsAdmin}
          </Button>
        </div>
      ) : null}
      <div className="bg-muted grid h-8 w-full grid-cols-2 rounded-lg p-[3px]">
        <ModeToggle
          active={mode === "signin"}
          onClick={() => {
            setMode("signin");
            setError(null);
            setSuccess(null);
            setConfirmPassword("");
          }}
        >
          {t.signIn}
        </ModeToggle>
        <ModeToggle
          active={mode === "signup"}
          onClick={() => {
            setMode("signup");
            setError(null);
            setSuccess(null);
            setConfirmPassword("");
          }}
        >
          {t.createAccount}
        </ModeToggle>
      </div>

      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <div className="space-y-1">
          <Label htmlFor="email">{t.email}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder={t.emailPlaceholder}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <PasswordField
          id="password"
          label={t.password}
          placeholder={t.passwordPlaceholder}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={setPassword}
        />
        {mode === "signin" ? (
          <p className="text-right">
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              {t.forgotPassword}
            </Link>
          </p>
        ) : null}
        {mode === "signup" ? (
          <PasswordField
            id="confirm-password"
            label={t.confirmPassword}
            placeholder={t.confirmPlaceholder}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            invalid={Boolean(confirmPassword) && confirmPassword !== password}
          />
        ) : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {success ? (
          <p className="text-sm text-emerald-700">{success}</p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending
            ? mode === "signup"
              ? t.creatingAccount
              : t.signingIn
            : mode === "signup"
              ? t.createAccount
              : t.signIn}
        </Button>
      </form>
    </div>
  );
}

function ModeToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-1.5 text-sm font-medium transition-all",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-foreground/60 hover:text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
