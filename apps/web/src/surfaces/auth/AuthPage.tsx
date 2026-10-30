import { PlaceholderPage } from "../../components/PlaceholderPage";

interface AuthPageProps {
  mode: "login" | "signup";
}

export default function AuthPage({ mode }: AuthPageProps) {
  const isLogin = mode === "login";
  return (
    <PlaceholderPage
      testId={isLogin ? "surface-login" : "surface-signup"}
      title={isLogin ? "Log in" : "Create your account"}
    >
      <p>
        {isLogin ? "Logging in" : "Signing up"} is not available yet in this development preview.
      </p>
    </PlaceholderPage>
  );
}
