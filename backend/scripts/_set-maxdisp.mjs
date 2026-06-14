import { PrismaClient } from "@prisma/client";
import "dotenv/config";
const p=new PrismaClient();const T="a1e31227-e1cd-4fc1-aa18-d11ddef5e3de";
const v = Number(process.argv[2] ?? 5);
await p.empresa.update({where:{id:T},data:{maxDispositivos:v}});
console.log("maxDispositivos =>", v);
await p.$disconnect();
