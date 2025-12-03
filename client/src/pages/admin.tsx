import { ArrowLeft, Users, Save, Loader2, User, Shield, ShieldCheck, Plus, Trash2, Clock, Check, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";

type UserPreferences = {
  id: string;
  userId: string;
  displayName: string | null;
  personalTraining: string | null;
  isAdmin: boolean;
  isManager: boolean;
  approvalStatus: 'approved' | 'pending' | 'rejected' | null;
};

type UserWithPreferences = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  preferences?: UserPreferences;
};

export default function Admin() {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<UserWithPreferences | null>(null);
  const [trainingText, setTrainingText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({ email: '', firstName: '', lastName: '', password: '', isAdmin: false });

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<UserWithPreferences[]>({
    queryKey: ["/api/admin/users"],
    enabled: adminCheck?.isAdmin === true,
  });

  const { data: pendingUsers } = useQuery<UserWithPreferences[]>({
    queryKey: ["/api/admin/users/pending"],
    enabled: adminCheck?.isAdmin === true,
  });

  const updateTrainingMutation = useMutation({
    mutationFn: async ({ userId, personalTraining }: { userId: string; personalTraining: string }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/training`, { personalTraining });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save training");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Training saved",
        description: `Training data has been saved for ${selectedUser?.firstName || 'this user'}.`,
      });
      setIsSaving(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsSaving(false);
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: { email: string; firstName: string; lastName: string; isAdmin: boolean }) => {
      const response = await apiRequest("POST", "/api/admin/users", userData);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create user");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User created",
        description: `${newUserData.firstName} ${newUserData.lastName} has been added.`,
      });
      setIsAddDialogOpen(false);
      setNewUserData({ email: '', firstName: '', lastName: '', password: '', isAdmin: false });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete user");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (selectedUser) {
        setSelectedUser(null);
        setTrainingText("");
      }
      toast({
        title: "User deleted",
        description: "The user has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/admin`, { isAdmin });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update admin status");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Admin status updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: 'approved' | 'rejected' }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/approval`, { status });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update approval status");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/pending"] });
      toast({
        title: variables.status === 'approved' ? "User approved" : "User rejected",
        description: variables.status === 'approved' 
          ? "User can now access the application." 
          : "User access has been revoked.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSelectUser = (user: UserWithPreferences) => {
    setSelectedUser(user);
    setTrainingText(user.preferences?.personalTraining || "");
  };

  const handleSaveTraining = () => {
    if (!selectedUser) return;
    setIsSaving(true);
    updateTrainingMutation.mutate({
      userId: selectedUser.id,
      personalTraining: trainingText,
    });
  };

  const getUserDisplayName = (user: UserWithPreferences) => {
    if (user.preferences?.displayName) return user.preferences.displayName;
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    if (user.firstName) return user.firstName;
    if (user.email) return user.email.split('@')[0];
    return 'Unknown User';
  };

  const getInitials = (user: UserWithPreferences) => {
    const name = getUserDisplayName(user);
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (!adminCheck?.isAdmin) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Admin Access Required</h2>
              <p className="text-muted-foreground">
                You don't have permission to access this page.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6" data-testid="link-back-home">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-admin-title">Team Training Management</h1>
              <p className="text-muted-foreground">Upload scripts and training data for team members</p>
            </div>
          </div>
        </div>

        {/* Pending Approvals Section */}
        {pendingUsers && pendingUsers.length > 0 && (
          <Card className="mb-6 border-amber-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Pending Approvals
                <Badge variant="secondary" className="ml-2">{pendingUsers.length}</Badge>
              </CardTitle>
              <CardDescription>
                These users are waiting for approval to access the application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted"
                    data-testid={`pending-user-${user.id}`}
                  >
                    <Avatar className="h-10 w-10">
                      {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={getUserDisplayName(user)} />}
                      <AvatarFallback>{getInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{getUserDisplayName(user)}</div>
                      <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => approvalMutation.mutate({ userId: user.id, status: 'approved' })}
                        disabled={approvalMutation.isPending}
                        data-testid={`button-approve-${user.id}`}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approvalMutation.mutate({ userId: user.id, status: 'rejected' })}
                        disabled={approvalMutation.isPending}
                        data-testid={`button-reject-${user.id}`}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Members
                </CardTitle>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-user">
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Team Member</DialogTitle>
                      <DialogDescription>
                        Add a new user to the team. They'll sign in with email and password.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            value={newUserData.firstName}
                            onChange={(e) => setNewUserData({ ...newUserData, firstName: e.target.value })}
                            placeholder="John"
                            data-testid="input-first-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            value={newUserData.lastName}
                            onChange={(e) => setNewUserData({ ...newUserData, lastName: e.target.value })}
                            placeholder="Doe"
                            data-testid="input-last-name"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newUserData.email}
                          onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                          placeholder="john@heartautocare.com"
                          data-testid="input-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          value={newUserData.password}
                          onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                          placeholder="At least 8 characters"
                          data-testid="input-password"
                        />
                        <p className="text-xs text-muted-foreground">Password for the new user to sign in</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="isAdmin"
                          checked={newUserData.isAdmin}
                          onCheckedChange={(checked) => setNewUserData({ ...newUserData, isAdmin: checked })}
                          data-testid="switch-admin"
                        />
                        <Label htmlFor="isAdmin">Admin privileges</Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => createUserMutation.mutate(newUserData)}
                        disabled={createUserMutation.isPending || !newUserData.email || !newUserData.firstName || !newUserData.lastName || newUserData.password.length < 8}
                        data-testid="button-create-user"
                      >
                        {createUserMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Add User'
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <CardDescription>
                Select a user to manage their training
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {users?.map((user) => (
                    <div
                      key={user.id}
                      className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                        selectedUser?.id === user.id
                          ? 'bg-accent'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <button
                        onClick={() => handleSelectUser(user)}
                        className="flex-1 flex items-center gap-3 p-1 text-left hover-elevate rounded"
                        data-testid={`button-user-${user.id}`}
                      >
                        <Avatar className="h-10 w-10">
                          {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={getUserDisplayName(user)} />}
                          <AvatarFallback>{getInitials(user)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{getUserDisplayName(user)}</div>
                          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {user.preferences?.isAdmin && (
                            <Badge>Admin</Badge>
                          )}
                          {user.preferences?.personalTraining && (
                            <Badge variant="secondary">Trained</Badge>
                          )}
                        </div>
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {getUserDisplayName(user)}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUserMutation.mutate(user.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              data-testid="button-confirm-delete"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                  {users?.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No team members found
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {selectedUser ? getUserDisplayName(selectedUser) : 'Select a User'}
              </CardTitle>
              <CardDescription>
                {selectedUser
                  ? 'Add training examples and guidelines for this user'
                  : 'Click on a team member to view and edit their training data'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedUser ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                    <Avatar className="h-12 w-12">
                      {selectedUser.profileImageUrl && <AvatarImage src={selectedUser.profileImageUrl} alt={getUserDisplayName(selectedUser)} />}
                      <AvatarFallback>{getInitials(selectedUser)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">{getUserDisplayName(selectedUser)}</div>
                      <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                    </div>
                    <div className="ml-auto flex gap-2">
                      {selectedUser.preferences?.isAdmin && (
                        <Badge>Admin</Badge>
                      )}
                      {selectedUser.preferences?.isManager && (
                        <Badge variant="secondary">Manager</Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Personal Training Data</label>
                    <Textarea
                      value={trainingText}
                      onChange={(e) => setTrainingText(e.target.value)}
                      placeholder={`Enter training examples and guidelines for ${getUserDisplayName(selectedUser)}...

Example format:
- Include sample successful scripts
- Add phrases that work well for this advisor
- Note specific communication preferences
- Mention any special techniques they use`}
                      className="min-h-[300px] font-mono text-sm"
                      data-testid="textarea-training"
                    />
                    <p className="text-xs text-muted-foreground">
                      This training data will be used to personalize AI-generated scripts for this team member.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleSaveTraining}
                      disabled={isSaving}
                      data-testid="button-save-training"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Training
                        </>
                      )}
                    </Button>
                    {trainingText && (
                      <Button
                        variant="outline"
                        onClick={() => setTrainingText("")}
                        disabled={isSaving}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mb-4 opacity-50" />
                  <p>Select a team member from the list to manage their training data.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
