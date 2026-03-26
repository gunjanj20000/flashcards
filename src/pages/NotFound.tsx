import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md p-8 rounded-3xl shadow-lg">
        <div className="text-center space-y-6">
          {/* Large 404 */}
          <div className="space-y-2">
            <h1 className="text-7xl font-bold text-primary">404</h1>
            <p className="text-sm text-muted-foreground">Page Not Found</p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <p className="text-lg font-semibold text-foreground">
              Oops! We can't find that page
            </p>
            <p className="text-sm text-muted-foreground">
              The route <code className="bg-muted px-2 py-1 rounded text-xs font-mono">{location.pathname}</code> doesn't exist.
            </p>
          </div>

          {/* Navigation Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-4">
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              className="h-11 rounded-xl font-semibold"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button
              onClick={() => navigate("/")}
              className="h-11 rounded-xl font-semibold"
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default NotFound;
