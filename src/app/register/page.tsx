import { LoginScreen } from "@/components/admin/login-form";

export default async function RegisterPage({
  searchParams,
}: PageProps<"/register">) {
  return <LoginScreen initialMode="signup" query={await searchParams} />;
}
