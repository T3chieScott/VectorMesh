import { useState } from "react";
import { useRoute, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlertCircle, CheckCircle2, ArrowLeft, KeyRound } from "lucide-react";

export default function ResetPasswordPage() {
  const [, params] = useRoute("/reset-password/:token");
  const token = params?.token || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/reset-password", { token, newPassword });
      const data = await res.json();
      if (data.ok) {
        setSuccess(true);
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("expired")) {
        setError("This reset link has expired. Please request a new one.");
      } else if (msg.includes("used")) {
        setError("This reset link has already been used.");
      } else if (msg.includes("Invalid")) {
        setError("Invalid reset link. Please request a new one.");
      } else {
        setError("Failed to reset password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src="/vectormesh-app-icon.png" alt="VectorMesh" className="h-12 w-12 rounded-lg" />
          </div>
          <h1 className="text-2xl font-bold">
            <span className="text-[#1a3a5c] dark:text-[#7eb8e0]">Vector</span>
            <span className="text-[#0ea5e9]">Mesh</span>
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Set New Password</CardTitle>
            <CardDescription>Choose a strong password for your account</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-4">
                <Alert data-testid="alert-reset-success">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    Your password has been reset successfully. You can now sign in with your new password.
                  </AlertDescription>
                </Alert>
                <Link href="/login">
                  <Button className="w-full" data-testid="button-go-to-login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" data-testid="alert-reset-error">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    data-testid="input-new-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    data-testid="input-confirm-password"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading} data-testid="button-reset-password">
                  {loading ? "Resetting..." : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Reset Password
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <Link href="/login" className="text-sm text-primary hover:underline" data-testid="link-back-to-login">
                    Back to Sign In
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
