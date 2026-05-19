import "dotenv/config";
import { DeliveryStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma.ts";

async function main() {
  const delivery = await prisma.delivery.create({
    data: {
      status: DeliveryStatus.CREATED,
    },
  });

  console.log("Test delivery created:");
  console.log(delivery);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });