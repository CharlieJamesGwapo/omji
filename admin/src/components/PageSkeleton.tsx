import React from 'react';

interface PageSkeletonProps {
  /** Number of stat cards to show */
  statCards?: number;
  /** Number of filter buttons */
  filterButtons?: number;
  /** Number of table rows */
  tableRows?: number;
  /** Show search bar */
  showSearch?: boolean;
}

const PageSkeleton: React.FC<PageSkeletonProps> = ({
  statCards = 4,
  filterButtons = 0,
  tableRows = 8,
  showSearch = true,
}) => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        {showSearch && <div className="h-10 w-full sm:w-80 bg-gray-200 rounded-lg" />}
      </div>

      {/* Stat cards */}
      {statCards > 0 && (() => {
        const gridCols = statCards >= 5 ? 'lg:grid-cols-5' : statCards >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
        return (
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${gridCols} gap-3 sm:gap-4`}>
          {Array.from({ length: statCards }, (_, i) => (
            <div key={i} className="h-20 sm:h-24 bg-gray-200 rounded-xl" />
          ))}
        </div>
        );
      })()}

      {/* Filter buttons */}
      {filterButtons > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: filterButtons }, (_, i) => (
            <div key={i} className="h-9 w-20 bg-gray-200 rounded-lg" />
          ))}
        </div>
      )}

      {/* Table rows */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {Array.from({ length: tableRows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-50">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-2 bg-gray-200 rounded w-1/2" />
            </div>
            <div className="h-6 w-20 bg-gray-200 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default PageSkeleton;
