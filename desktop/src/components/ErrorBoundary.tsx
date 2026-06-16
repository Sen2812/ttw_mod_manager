import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catch render errors so the window shows a message instead of a blank screen. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[UI] Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen flex items-center justify-center bg-morandi-page p-8">
          <div className="max-w-md text-center space-y-3">
            <h1 className="text-lg font-semibold text-morandi-text">界面加载失败</h1>
            <p className="text-sm text-morandi-text-secondary break-words">
              {this.state.error.message}
            </p>
            <button
              type="button"
              className="btn-morandi text-sm"
              onClick={() => window.location.reload()}
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
