import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { LogIn, AlertCircle, ShieldCheck, ArrowLeft, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, verifyTwoFactor, isLoggingIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const verifyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (totpCode.length === 6) {
      verifyButtonRef.current?.focus();
    }
  }, [totpCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = await login({ email, password });
      if (result.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        return;
      }
      if (result.mustChangePassword) {
        setLocation("/change-password");
      } else {
        setLocation("/");
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("401")) {
        setError("Invalid email or password");
      } else if (msg.includes("deactivated")) {
        setError("Your account has been deactivated. Contact your administrator.");
      } else {
        setError("Login failed. Please try again.");
      }
    }
  }

  async function handleTwoFactorVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (totpCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      const user = await verifyTwoFactor(totpCode);
      if (user.mustChangePassword) {
        setLocation("/change-password");
      } else {
        setLocation("/");
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("Invalid code")) {
        setError("Invalid code. Please try again.");
      } else {
        setError("Verification failed. Please try again.");
      }
    } finally {
      setVerifying(false);
    }
  }

  function handleBackToLogin() {
    setRequiresTwoFactor(false);
    setTotpCode("");
    setError("");
    setPassword("");
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
          <p className="text-muted-foreground text-sm">Display Management Platform</p>
        </div>

        <Card>
          {!requiresTwoFactor ? (
            <>
              <CardHeader>
                <CardTitle className="text-lg">Sign In</CardTitle>
                <CardDescription>Enter your credentials to access the dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <Alert variant="destructive" data-testid="alert-login-error">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      data-testid="input-password"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoggingIn} data-testid="button-login">
                    {isLoggingIn ? "Signing in..." : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        Sign In
                      </>
                    )}
                  </Button>

                  <div className="text-center">
                    <Link href="/forgot-password" className="text-sm text-primary hover:underline" data-testid="link-forgot-password">
                      Forgot your password?
                    </Link>
                  </div>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Two-Factor Authentication
                </CardTitle>
                <CardDescription>
                  Enter the 6-digit code from your authenticator app
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleTwoFactorVerify} className="space-y-6">
                  {error && (
                    <Alert variant="destructive" data-testid="alert-2fa-login-error">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={totpCode}
                      onChange={(val) => setTotpCode(val)}
                      autoFocus
                      data-testid="input-2fa-login-code"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <Button ref={verifyButtonRef} type="submit" className="w-full" disabled={verifying || totpCode.length !== 6} data-testid="button-verify-2fa-login">
                    {verifying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Verify
                      </>
                    )}
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleBackToLogin}
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      data-testid="button-back-to-login"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back to login
                    </button>
                  </div>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
