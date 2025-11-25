import { useState, useEffect } from "react";
import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { SearchJobRequest } from "@shared/schema";

interface SearchInterfaceProps {
  onSearch: (params: SearchJobRequest) => void;
  isLoading?: boolean;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

const makes = [
  "Ford", "Chevrolet", "Toyota", "Honda", "Nissan", "Dodge", "RAM", "Jeep",
  "GMC", "Subaru", "Hyundai", "Kia", "Mazda", "Volkswagen", "BMW", "Mercedes-Benz",
  "Audi", "Lexus", "Acura", "Infiniti", "Cadillac", "Lincoln", "Buick", "Chrysler"
].sort();

export function SearchInterface({ onSearch, isLoading }: SearchInterfaceProps) {
  const [make, setMake] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [engine, setEngine] = useState<string>("");
  const [repairType, setRepairType] = useState<string>("");
  const [autoSearchTriggered, setAutoSearchTriggered] = useState(false);
  const [isPreFilled, setIsPreFilled] = useState(false);
  const [urlParamsLoaded, setUrlParamsLoaded] = useState(false);

  // CRITICAL FIX: Only load URL params ONCE on initial mount
  // Previously, this ran every time onSearch changed, overwriting user edits!
  useEffect(() => {
    if (urlParamsLoaded) return; // Skip if already loaded
    
    const params = new URLSearchParams(window.location.search);
    
    const urlMake = params.get('make');
    const urlModel = params.get('model');
    const urlYear = params.get('year');
    const urlEngine = params.get('engine');
    const urlSearch = params.get('search');

    if (urlMake) setMake(urlMake);
    if (urlModel) setModel(urlModel);
    if (urlYear) setYear(urlYear);
    if (urlEngine) setEngine(urlEngine);
    if (urlSearch) {
      setRepairType(urlSearch);
      setIsPreFilled(true);
    }

    setUrlParamsLoaded(true); // Mark as loaded

    if (urlSearch && !autoSearchTriggered) {
      setAutoSearchTriggered(true);
      setTimeout(() => {
        onSearch({
          vehicleMake: urlMake || undefined,
          vehicleModel: urlModel || undefined,
          vehicleYear: urlYear ? parseInt(urlYear) : undefined,
          vehicleEngine: urlEngine || undefined,
          repairType: urlSearch,
          limit: 20,
        });
      }, 500);
    }
  }, []); // Empty dependency array = run only once on mount

  const handleSearch = () => {
    if (!repairType.trim()) return;

    // Clear broadenStrategy on manual searches - only use it when "Broaden Search" button is clicked
    onSearch({
      vehicleMake: make || undefined,
      vehicleModel: model || undefined,
      vehicleYear: year ? parseInt(year) : undefined,
      vehicleEngine: engine || undefined,
      repairType: repairType.trim(),
      limit: 20,
      broadenStrategy: undefined, // Explicitly clear broadening
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && repairType.trim()) {
      handleSearch();
    }
  };

  return (
    <Card className="h-fit" data-testid="search-interface">
      <CardHeader className="space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold">Search Job History</CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Find similar repairs from your historical data
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="year" className="text-xs font-medium uppercase tracking-wide">
            Year
          </Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger id="year" data-testid="select-year">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="make" className="text-xs font-medium uppercase tracking-wide">
            Make
          </Label>
          <Select value={make} onValueChange={setMake}>
            <SelectTrigger id="make" data-testid="select-make">
              <SelectValue placeholder="Select make" />
            </SelectTrigger>
            <SelectContent>
              {makes.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="model" className="text-xs font-medium uppercase tracking-wide">
            Model
          </Label>
          <Input
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g., F-150, Camry, Civic"
            onKeyDown={handleKeyDown}
            data-testid="input-model"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="engine" className="text-xs font-medium uppercase tracking-wide">
            Engine <span className="text-muted-foreground font-normal">(Optional)</span>
          </Label>
          <Input
            id="engine"
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            placeholder="e.g., 3.5L V6, 2.0L I4"
            onKeyDown={handleKeyDown}
            data-testid="input-engine"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="repairType" className="text-xs font-medium uppercase tracking-wide">
              Repair Type <span className="text-destructive">*</span>
            </Label>
            {isPreFilled && (
              <Badge variant="secondary" className="text-xs gap-1" data-testid="badge-prefilled">
                <Sparkles className="w-3 h-3" />
                From Tekmetric
              </Badge>
            )}
          </div>
          <Input
            id="repairType"
            value={repairType}
            onChange={(e) => {
              setRepairType(e.target.value);
              setIsPreFilled(false);
            }}
            placeholder="e.g., front struts, oil change"
            onKeyDown={handleKeyDown}
            data-testid="input-repair-type"
            className="font-medium"
          />
        </div>

        <Button
          onClick={handleSearch}
          disabled={!repairType.trim() || isLoading}
          className="w-full font-semibold"
          data-testid="button-search"
        >
          <Search className="w-4 h-4 mr-2" />
          {isLoading ? "Searching..." : "Search Similar Jobs"}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          AI will find similar vehicles and repair types
        </p>
      </CardContent>
    </Card>
  );
}
