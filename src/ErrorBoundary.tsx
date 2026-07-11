import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function safeRememberCrash(message: string) {
  try {
    localStorage.setItem(
      "fluent-music-last-crash",
      JSON.stringify({ message, time: new Date().toISOString() }),
    );
  } catch {
    // 某些 WebView 的隐私模式会禁用 localStorage，不能让错误记录再次触发崩溃。
  }
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Fluent Music render error", error, info);
    safeRememberCrash(error.message || "未知渲染错误");
  }

  private resetLocalData = () => {
    try {
      const preservedTheme = localStorage.getItem("fluent-music-dark");
      Object.keys(localStorage)
        .filter((key) => key.startsWith("fluent-music-"))
        .forEach((key) => localStorage.removeItem(key));
      if (preservedTheme !== null) localStorage.setItem("fluent-music-dark", preservedTheme);
    } catch {
      // 即使存储不可用，也允许重新载入。
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-fallback" role="alert">
        <section className="fatal-card">
          <div className="fatal-logo">♪</div>
          <p className="fatal-kicker">FLUENT MUSIC · 安全恢复</p>
          <h1>播放器没有继续白屏</h1>
          <p>
            界面运行时遇到异常，已切换到恢复页。通常是旧版缓存、WebView 图形能力或系统媒体接口兼容问题。
          </p>
          <pre>{this.state.error.message || "未知运行错误"}</pre>
          <div className="fatal-actions">
            <button type="button" onClick={() => window.location.reload()}>重新载入</button>
            <button type="button" className="secondary" onClick={this.resetLocalData}>清理播放器缓存并重启</button>
          </div>
        </section>
      </main>
    );
  }
}
