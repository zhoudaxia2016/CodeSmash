import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from '@/App'
import { Battle } from '@/pages/battle'
import { BattleHistory } from '@/pages/battle/history'
import { LeaderboardPage } from '@/pages/leaderboard'
import { ProblemsPage } from '@/pages/problems'
import { Admin } from '@/pages/admin'

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        {
          index: true,
          element: <Navigate to="/battle" replace />,
        },
        {
          path: 'battle',
          element: <Battle />,
        },
        {
          path: 'history',
          element: <BattleHistory />,
        },
        {
          path: 'problems',
          element: <ProblemsPage />,
        },
        {
          path: 'leaderboard',
          element: <LeaderboardPage />,
        },
        {
          path: 'admin/models',
          element: <Admin tab="models" />,
        },
        {
          path: 'admin/logs',
          element: <Admin tab="logs" />,
        },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  },
)
