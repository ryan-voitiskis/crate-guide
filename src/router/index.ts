import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import SessionView from "../views/SessionView.vue";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "session",
    component: SessionView,
  },
  {
    path: "/collection",
    name: "collection",
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () =>
      import(/* webpackChunkName: "about" */ "../views/CollectionManager.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
