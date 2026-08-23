
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<Props, State> {
  // @ts-ignore
  public props: Props;
  // @ts-ignore
  public state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: any, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private isFirestoreError(error: any) {
    try {
      const parsed = JSON.parse(error.message);
      return parsed && parsed.error && parsed.operationType;
    } catch {
      return false;
    }
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      let details = "";

      if (this.isFirestoreError(this.state.error)) {
        const info = JSON.parse(this.state.error.message);
        errorMessage = "Database Access Error";
        details = `Operation: ${info.operationType} on path: ${info.path}. Error: ${info.error}`;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-red-100">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">{errorMessage}</h1>
            <p className="text-gray-500 mb-6">
              {details || "An unexpected error occurred. Please try refreshing the page or contact support."}
            </p>
            {details && (
              <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
                <p className="text-xs font-mono text-gray-400 uppercase mb-1">Technical Details</p>
                <p className="text-sm font-mono text-red-600 break-all">{details}</p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all active:scale-95"
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
