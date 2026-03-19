import React, { useEffect, useState } from 'react';
import { rideService, deliveryService, orderService } from '../services/api';
import { useAuthStore } from '../context/authStore';

const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ rides: 0, deliveries: 0, orders: 0 });
  const [recentItems, setRecentItems] = useState<{ rides: any[]; deliveries: any[]; orders: any[] }>({ rides: [], deliveries: [], orders: [] });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [ridesRes, deliveriesRes, ordersRes] = await Promise.all([
        rideService.getActiveRides(),
        deliveryService.getActiveDeliveries(),
        orderService.getActiveOrders(),
      ]).catch(() => [{ data: [] }, { data: [] }, { data: [] }]);

      setStats({
        rides: ridesRes.data.length || 0,
        deliveries: deliveriesRes.data.length || 0,
        orders: ordersRes.data.length || 0,
      });

      setRecentItems({
        rides: ridesRes.data.slice(0, 3) || [],
        deliveries: deliveriesRes.data.slice(0, 3) || [],
        orders: ordersRes.data.slice(0, 3) || [],
      });
    } catch (error) {
      console.error('Failed to load dashboard data');
    }
  };

  const StatCard = ({ icon, title, value, color }: { icon: any; title: string; value: string | number; color: string }) => (
    <div className={`${color} rounded-lg p-6 text-white`}>
      <div className="text-4xl mb-2">{icon}</div>
      <div className="text-sm opacity-90">{title}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome, {user?.name}!</h1>
        <p className="text-gray-600">Here's what's happening with your services today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          icon="🚗"
          title="Active Rides"
          value={stats.rides}
          color="bg-blue-500"
        />
        <StatCard
          icon="📦"
          title="Active Deliveries"
          value={stats.deliveries}
          color="bg-orange-500"
        />
        <StatCard
          icon="🍔"
          title="Active Orders"
          value={stats.orders}
          color="bg-green-500"
        />
      </div>

      {/* Services Grid */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <ServiceCard
            icon="🚗"
            title="Pasundo"
            description="Book a ride"
            href="/rides"
            color="from-blue-400 to-blue-600"
          />
          <ServiceCard
            icon="📦"
            title="Pasugo"
            description="Send parcels"
            href="/delivery"
            color="from-orange-400 to-orange-600"
          />
          <ServiceCard
            icon="🍔"
            title="Food & Stores"
            description="Order food"
            href="/stores"
            color="from-green-400 to-green-600"
          />
          <ServiceCard
            icon="🚙"
            title="Pasabay"
            description="Share rides"
            href="/rides"
            color="from-purple-400 to-purple-600"
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {recentItems.rides.length > 0 && (
          <div className="card">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Rides</h3>
              <div className="space-y-3">
                {recentItems.rides.map((ride) => (
                  <div key={ride.id} className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-600">{ride.pickupLocation}</p>
                    <p className="text-xs text-gray-400 mt-1">{ride.status}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ServiceCard = ({ icon, title, description, href, color }: { icon: any; title: string; description: string; href: string; color: string }) => (
  <a href={href} className={`card bg-gradient-to-br ${color} overflow-hidden group cursor-pointer transform transition hover:scale-105`}>
    <div className="p-6 text-white">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-bold text-lg">{title}</h3>
      <p className="text-sm opacity-90">{description}</p>
    </div>
  </a>
);

export default DashboardPage;
