"use client";

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/radix/tabs";

import { MOCK_USERS } from "@/lib/cads/subscriptions";

interface UserSwitcherProps {
  selectedUserId: string;
  onUserChange: (userId: string) => void;
}

export function UserSwitcher({
  selectedUserId,
  onUserChange,
}: UserSwitcherProps) {
  return (
    <div className="space-y-2 px-2 py-2">
      <p className="text-xs font-medium">
        Demo user
      </p>

      <Tabs
        value={selectedUserId}
        onValueChange={onUserChange}
      >
        <TabsList
          className="w-full"
          aria-label="Select demo user"
        >
          {MOCK_USERS.map((user) => (
            <TabsTrigger
              key={user.id}
              value={user.id}
              className="px-1 text-xs"
            >
              {user.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>


    </div>
  );
}