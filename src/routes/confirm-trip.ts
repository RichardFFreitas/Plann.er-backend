import { FastifyInstance } from "fastify";

import { ZodTypeProvider } from "fastify-type-provider-zod";


import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getMailClient } from "../lib/mail";
import { dayjs } from '../lib/dayjs'

import nodemailer from "nodemailer"
import { ClientError } from "../erros/client-error";
import { env } from "../env";



export async function confirmTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/trips/:tripId/confirm",
    {
      schema: {
        params: z.object({
          tripId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { tripId } = request.params

      const trip = await prisma.trip.findUnique({
        where: {
          id: tripId,
        },
        include: {
          participants: {
            where: {
              is_ownder: false
            }
          }
        }
      })

      if(!trip) {
        throw new ClientError('Trip not found.')
      }
      
      if(trip.is_confirmed) {
        return reply.redirect(`${env.WEB_BASE_URL}/trips/${tripId}`)
      }

      await prisma.trip.update({
        where: { id: tripId},
        data: { is_confirmed: true }
      })


      const formattedStartDate = dayjs(trip.start_at).format('LL')
      const formattedEndDate = dayjs(trip.ends_at).format('LL')

      const mail = await getMailClient();

      await Promise.all(
        trip.participants.map(async (participant) => {
          const confirmationLink =  `${env.API_BASE_URL}/participant/${participant.id}/confirm`
          const message = await mail.sendMail({
            from: {
              name: "Equipe Plann.er",
              address: "contato@plann.er.com",
            },
            to: participant.email,
            subject: `Confirme sua presença na viagem para ${trip.destination} em ${formattedStartDate}`,
            html: `
            <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;">
                <p>
                    Você foi convidado(a) para participar de uma viagem para <strong>${trip.destination}</strong>  nas datas
                    de <strong>${formattedStartDate} à ${formattedEndDate} </strong> 
                </p>
                <p></p>
                <p>Para confirmar sua presença na viagem, clique no link abaixo:</p>
                <p></p>
                <p>
                    <a href="${confirmationLink}">confirmar viagem</a>
                </p>
                <p></p>
                <p>
                    Caso esteja utilizando um dispositivo móvel, você também pode confirmar a
                    criação da viagem pelos aplicativos:
                </p>
                <p></p>
                <p>Caso você não saiba do que se trata esse e-mail, apenas ignore-o.</p>
            </div>
    
            `.trim(),
          });
    
          console.log(nodemailer.getTestMessageUrl(message));
        })
      )

      return reply.redirect(`${env.WEB_BASE_URL}/trips/${tripId}`)
    }
  );
}


