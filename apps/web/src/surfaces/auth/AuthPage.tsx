import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { PlaceholderPage } from "../../components/PlaceholderPage";
import { ErrorBanner } from "../../components/ErrorBanner";
import { FormField } from "../../components/FormField";
import { useErrorFocus } from "../../components/useErrorFocus";
import { formErrorsFrom, type FormErrors } from "../../api/errors";
import { useAuth } from "../../auth/auth-context";

interface AuthPageProps {
  mode: "login" | "signup";
}

const FIELDS = ["displayName", "email", "password"] as const;

export default function AuthPage({ mode }: AuthPageProps) {
  const isLogin = mode === "login";
  const { state, login, signup } = useAuth();
  const location = useLocation();
  const notice = (location.state as { message?: unknown } | null)?.message;

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({ fields: {}, banner: null });
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { bannerRef, formRef } = useErrorFocus(attempt);

  // Always /app: no ?next= parameter, so there is no open redirect.
  if (state.status === "authenticated") return <Navigate to="/app" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setErrors({ fields: {}, banner: null });
    try {
      if (isLogin) await login({ email, password });
      else await signup({ email, password, displayName });
    } catch (error) {
      setErrors(formErrorsFrom(error, FIELDS));
      setAttempt((count) => count + 1);
      setPending(false);
    }
  }

  return (
    <PlaceholderPage
      testId={isLogin ? "surface-login" : "surface-signup"}
      title={isLogin ? "Log in" : "Create your account"}
    >
      {typeof notice === "string" ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}
      <ErrorBanner message={errors.banner} ref={bannerRef} />
      <form className="form" onSubmit={onSubmit} noValidate ref={formRef}>
        {isLogin ? null : (
          <FormField
            label="Display name"
            name="displayName"
            autoComplete="name"
            required
            maxLength={80}
            value={displayName}
            onChange={setDisplayName}
            error={errors.fields["displayName"]}
          />
        )}
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
          error={errors.fields["email"]}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          required
          hint={isLogin ? undefined : "10 to 128 characters."}
          value={password}
          onChange={setPassword}
          error={errors.fields["password"]}
        />
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? "Please wait…" : isLogin ? "Log in" : "Create account"}
        </button>
      </form>
      <p>
        {isLogin ? (
          <>
            No account yet? <Link to="/signup">Sign up</Link>
          </>
        ) : (
          <>
            Already have an account? <Link to="/login">Log in</Link>
          </>
        )}
      </p>
    </PlaceholderPage>
  );
}
