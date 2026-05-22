import { resetDemoUserPasswords } from "./service.js";

const users = await resetDemoUserPasswords();

console.log("Demo user passwords were reset:");
for (const user of users) {
  console.log(`${user.role}: ${user.phone} / ${user.password}`);
}
