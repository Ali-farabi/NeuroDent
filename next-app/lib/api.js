function delay(ms = 600) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function login(phone, password) {
  await delay(800);
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (cleanPhone.length < 10) throw new Error("Неверный номер телефона");

  if (password === "1234" || password === "owner")
    return { role: "owner", phone: cleanPhone, name: "Владелец" };
  if (password === "admin")
    return { role: "admin", phone: cleanPhone, name: "Админ" };
  if (password === "doctor")
    return { role: "doctor", phone: cleanPhone, name: "Врач" };
  if (password === "patient")
    return { role: "patient", phone: cleanPhone, name: "Пациент" };
  if (password === "assistant")
    return { role: "assistant", phone: cleanPhone, name: "Ассистент" };

  throw new Error("Неверный пароль. Попробуйте: 1234, admin, doctor, assistant или patient");
}
