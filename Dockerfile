FROM 453262333533.dkr.ecr.eu-central-1.amazonaws.com/from_playwright_chrom:latest
COPY ./ /var/app/
RUN npm i
RUN npm audit fix
RUN npm run build
RUN date +"%Y%m%d%H%M" > buildversion
EXPOSE 80
CMD ["npm", "start"]