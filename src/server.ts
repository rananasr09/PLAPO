import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { AccountCreator } from './services/AccountCreator';
import { DatabaseService } from './services/DatabaseService';
import routes from './routes';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const db = new DatabaseService();

// Serve static files from the public directory
app.use(express.static('public'));

// Use the routes
app.use(routes);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('startCreation', async (data: { count: number }) => {
        const { count } = data;
        const accountCreator = new AccountCreator(db, io);

        try {
            await accountCreator.startCreation(count, socket);
        } catch (error: unknown) {
            socket.emit('creationError', { error: error instanceof Error ? error.message : 'Unknown error occurred' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    db.close();
    process.exit(0);
}); 