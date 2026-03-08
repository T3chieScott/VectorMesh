import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ShieldCheck, AlertCircle, Loader2, Copy, Check } from "lucide-react";

export default function Setup2FAPage() {
  const queryClient = useQueryClient();
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function startSetup() {
      try {
        const res = await apiRequest("POST", "/api/auth/2fa/setup");
        const data = await res.json();
        setQrCode(data.qrCode);
        setSecret(data.secret);
      } catch {
        setError("Failed to initialize 2FA setup. Please refresh.");
      } finally {
        setLoading(false);
      }
    }
    startSetup();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (code.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      await apiRequest("POST", "/api/auth/2fa/confirm-setup", { code });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("Invalid code")) {
        setError("Invalid code. Please check your authenticator and try again.");
      } else {
        setError("Verification failed. Please try again.");
      }
    } finally {
      setVerifying(false);
    }
  }

  function handleCopySecret() {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <p className="text-muted-foreground text-sm">Two-Factor Authentication Setup</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Set Up Authenticator
            </CardTitle>
            <CardDescription>
              Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to verify.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8" data-testid="loading-2fa-setup">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleVerify} className="space-y-6">
                {error && (
                  <Alert variant="destructive" data-testid="alert-2fa-error">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {qrCode && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-white p-3 rounded-lg">
                      <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" data-testid="img-2fa-qr" />
                    </div>

                    <div className="w-full space-y-2">
                      <p className="text-xs text-muted-foreground text-center">
                        Can't scan? Enter this key manually:
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all" data-testid="text-2fa-secret">
                          {secret}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopySecret}
                          data-testid="button-copy-secret"
                        >
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium text-center">Enter verification code</p>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={code}
                      onChange={(val) => setCode(val)}
                      data-testid="input-2fa-code"
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
                </div>

                <Button type="submit" className="w-full" disabled={verifying || code.length !== 6} data-testid="button-verify-2fa">
                  {verifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Verify & Enable 2FA
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
