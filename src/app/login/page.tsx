import { LoginScreen } from "@/components/admin/login-form";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  return <LoginScreen initialMode="signin" query={await searchParams} />;
}
