import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setSent(true);
    } catch {
      setSent(true);
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
            <CardTitle className="text-lg">Reset Password</CardTitle>
            <CardDescription>Enter your email to receive a password reset link</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <Alert data-testid="alert-reset-sent">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    If an account exists with that email, a password reset link has been sent. Check your inbox.
                  </AlertDescription>
                </Alert>
                <Link href="/login">
                  <Button variant="outline" className="w-full" data-testid="button-back-to-login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    data-testid="input-reset-email"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading} data-testid="button-send-reset">
                  {loading ? "Sending..." : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Reset Link
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
