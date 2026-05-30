import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/authContext";
import Nav from "@/components/Nav";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import CustomerDashboard from "@/pages/CustomerDashboard";
import ExpertDashboard from "@/pages/ExpertDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminMetrics from "@/pages/AdminMetrics";
import AdminExperts from "@/pages/AdminExperts";
import AdminSettings from "@/pages/AdminSettings";
import AdminActionItems from "@/pages/AdminActionItems";
import AdminEvents from "@/pages/AdminEvents";
import AdminEmailEvents from "@/pages/AdminEmailEvents";
import NewRequest from "@/pages/NewRequest";
import RequestDetail from "@/pages/RequestDetail";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/customer" component={CustomerDashboard} />
        <Route path="/customer/new-request" component={NewRequest} />
        <Route path="/expert" component={ExpertDashboard} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/metrics" component={AdminMetrics} />
        <Route path="/admin/experts" component={AdminExperts} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route path="/admin/action-items" component={AdminActionItems} />
        <Route path="/admin/events" component={AdminEvents} />
        <Route path="/admin/email-events" component={AdminEmailEvents} />
        <Route path="/requests/:id" component={RequestDetail} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
