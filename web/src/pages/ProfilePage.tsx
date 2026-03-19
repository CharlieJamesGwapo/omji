import React, { useEffect, useState } from 'react';
import { userService } from '../services/api';
import { useAuthStore } from '../context/authStore';

const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(user);
  const [_isEditing, _setIsEditing] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await userService.getProfile();
      setProfile(response.data);
    } catch (error) {
      console.error('Failed to load profile');
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">My Profile</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="card p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
              {profile?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{profile?.name}</h2>
              <p className="text-sm text-gray-600">{profile?.email}</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <p><span className="text-gray-600">Phone:</span> {profile?.phone}</p>
            <p><span className="text-gray-600">Role:</span> {profile?.role}</p>
            <p><span className="text-gray-600">Rating:</span> ⭐ {profile?.rating?.toFixed(1)}</p>
          </div>
        </div>

        {/* Menu */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center">
              <span className="font-medium text-gray-900">👤 Edit Profile</span>
              <span className="text-gray-400">›</span>
            </button>
          </div>
          <div className="card">
            <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center">
              <span className="font-medium text-gray-900">📍 Saved Addresses</span>
              <span className="text-gray-400">›</span>
            </button>
          </div>
          <div className="card">
            <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center">
              <span className="font-medium text-gray-900">💳 Payment Methods</span>
              <span className="text-gray-400">›</span>
            </button>
          </div>
          <div className="card">
            <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center">
              <span className="font-medium text-gray-900">📜 Ride History</span>
              <span className="text-gray-400">›</span>
            </button>
          </div>
          <div className="card">
            <button className="w-full p-4 text-left hover:bg-gray-50 flex justify-between items-center">
              <span className="font-medium text-gray-900">📧 Help & Support</span>
              <span className="text-gray-400">›</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
