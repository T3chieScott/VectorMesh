import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Monitor,
  Layers,
  Zap,
  BarChart3,
  Shield,
  Clock,
  ArrowRight,
  Play,
  Settings,
} from "lucide-react";

const features = [
  {
    icon: Monitor,
    title: "Multi-Screen Control",
    description:
      "Manage up to 50 meeting-room screens, 6 indoor displays, and 2 external LED walls from a single dashboard.",
  },
  {
    icon: Layers,
    title: "Flexible Layouts",
    description:
      "Create zone-based templates with media, tickers, clocks, logos, and HTML widgets for any screen configuration.",
  },
  {
    icon: Zap,
    title: "Live Overrides",
    description:
      "Take immediate control of any screen or group with priority-based temporary takeovers that auto-revert.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Diagnostics",
    description:
      "Monitor screen health, heartbeats, cache status, and current content from a centralized dashboard.",
  },
  {
    icon: Shield,
    title: "Reliable Fallbacks",
    description:
      "Screens continue playing cached content when offline and display branded standby slates as needed.",
  },
  {
    icon: Clock,
    title: "Smart Scheduling",
    description:
      "Build programmes with time rules, day-of-week targeting, and priority-based content delivery.",
  },
];

const stats = [
  { value: "50+", label: "Screens Supported" },
  { value: "99.9%", label: "Uptime Target" },
  { value: "30s", label: "Update Latency" },
  { value: "24/7", label: "Offline Operation" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/vectormesh-app-icon.png" alt="VectorMesh" className="h-9 w-9 rounded-md" />
              <span className="text-lg font-semibold">VectorMesh</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-features"
              >
                Features
              </a>
              <a
                href="#stats"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-stats"
              >
                Performance
              </a>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <a href="/api/login">
                <Button data-testid="button-login">
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column - Text */}
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  <Zap className="h-3.5 w-3.5" />
                  Enterprise Display Management
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                  Control Every Screen,{" "}
                  <span className="text-primary">Everywhere</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-lg">
                  A powerful onsite display management platform for conference and
                  exhibition centres. Manage screens, schedule content, and
                  deliver stunning visual experiences.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <a href="/api/login">
                  <Button size="lg" className="w-full sm:w-auto" data-testid="button-get-started">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto"
                  data-testid="button-view-demo"
                >
                  <Play className="mr-2 h-4 w-4" />
                  View Demo
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span>No internet required</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>Auto-failover</span>
                </div>
              </div>
            </div>

            {/* Right Column - Visual */}
            <div className="relative lg:pl-8">
              <div className="relative">
                {/* Main Dashboard Preview */}
                <div className="relative rounded-xl border border-border bg-card p-2 shadow-2xl">
                  <div className="aspect-video rounded-lg bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
                    <div className="h-full flex flex-col">
                      {/* Mock Header */}
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-red-500/80" />
                          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                          <div className="w-3 h-3 rounded-full bg-green-500/80" />
                        </div>
                        <div className="flex-1 text-center text-xs text-white/40">
                          VectorMesh Dashboard
                        </div>
                      </div>
                      {/* Mock Content */}
                      <div className="flex-1 p-4 grid grid-cols-3 gap-3">
                        <div className="col-span-2 space-y-3">
                          <div className="h-24 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                            <Monitor className="h-8 w-8 text-primary/60" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="h-16 rounded-lg bg-white/5 border border-white/10" />
                            <div className="h-16 rounded-lg bg-white/5 border border-white/10" />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="h-12 rounded-lg bg-green-500/20 border border-green-500/30" />
                          <div className="h-12 rounded-lg bg-amber-500/20 border border-amber-500/30" />
                          <div className="h-12 rounded-lg bg-white/5 border border-white/10" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Cards */}
                <div className="absolute -left-8 top-1/4 hidden xl:block">
                  <Card className="w-48 shadow-lg">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse-online" />
                        <span className="text-xs font-medium">12 Screens Online</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="absolute -right-4 bottom-1/4 hidden xl:block">
                  <Card className="w-44 shadow-lg">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium">Live Override Active</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="py-16 border-y border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-primary">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold">
              Everything You Need for Display Management
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for conference and exhibition centres with enterprise-grade
              reliability and flexibility.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="group hover-elevate transition-all duration-300"
              >
                <CardContent className="p-6 space-y-4">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-primary/5">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to Transform Your Venue?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Start managing your displays with a platform built for
            reliability and scale.
          </p>
          <a href="/api/login">
            <Button size="lg" data-testid="button-cta-start">
              Get Started Now
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/vectormesh-app-icon.png" alt="VectorMesh" className="h-7 w-7 rounded-md" />
              <span className="text-sm font-medium">VectorMesh</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Display Management for Conference & Exhibition Centres
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
