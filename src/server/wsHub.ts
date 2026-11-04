import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAnyAuthToken } from '../middleware/auth.ts';
import {
  getVoiceRoomFullDetail,
  joinVoiceRoomSession,
  leaveVoiceRoomSession,
  toggleVoiceRoomCamera,
  toggleVoiceRoomMute,
} from '../db/voiceSystemRepo.ts';

interface ConnectedClient {
  ws: WebSocket;
  uid: string;
  displayName: string;
  avatarUrl: string;
  activeVoiceRoomId: number | null;
  activeCommunityId: number | null;
  activeCommunityRoomKey: string | null;
}

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ConnectedClient>();

  attach(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      const client: ConnectedClient = {
        ws,
        uid: '',
        displayName: 'Hunter',
        avatarUrl: '/assets/zenitsu-avatar.png',
        activeVoiceRoomId: null,
        activeCommunityId: null,
        activeCommunityRoomKey: null,
      };
      this.clients.add(client);

      ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          await this.handleMessage(client, msg);
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      });

      ws.on('close', async () => {
        this.clients.delete(client);

        if (client.activeCommunityRoomKey && client.activeCommunityId) {
          const [cidStr, roomSlug] = client.activeCommunityRoomKey.split(':');
          const cid = Number(cidStr);
          if (cid && roomSlug) {
            this.broadcastToCommunityRoom(cid, roomSlug, {
              type: 'community_room:presence',
              communityId: cid,
              roomSlug,
              onlineCount: this.getChatRoomOnlineCount(cid, roomSlug),
            });
          }
        }

        if (client.activeVoiceRoomId && client.uid) {
          const roomId = client.activeVoiceRoomId;
          client.activeVoiceRoomId = null;
          const stillConnected = Array.from(this.clients).some(
            (c) => c.uid === client.uid && c.activeVoiceRoomId === roomId
          );
          if (!stillConnected) {
            try {
              const updated = await leaveVoiceRoomSession(roomId, client.uid);
              this.broadcastToRoom(roomId, {
                type: 'voice:user-left',
                roomId,
                uid: client.uid,
                room: updated,
              });
              this.broadcastAll({
                type: 'voice:room-summary',
                roomId,
                participantCount: updated?.participantCount || 0,
                speakerCount: updated?.speakerCount || 0,
                listenerCount: updated?.listenerCount || 0,
              });
            } catch (err) {
              console.error('Cleanup voice participant failed:', err);
            }
          }
        }
      });
    });
  }

  private async handleMessage(client: ConnectedClient, msg: any) {
    if (msg.type === 'auth') {
      if (!msg.token) return;
      try {
        const decoded = await verifyAnyAuthToken(msg.token);
        client.uid = decoded.uid;
        client.displayName = msg.displayName || decoded.name || 'Hunter';
        client.avatarUrl = msg.avatarUrl || decoded.picture || '/assets/zenitsu-avatar.png';
        this.send(client.ws, {
          type: 'auth:ok',
          uid: client.uid,
          onlineUsers: this.getOnlineUserUids(),
        });
        this.broadcastAll({
          type: 'presence:online',
          onlineUsers: this.getOnlineUserUids(),
        });
      } catch {
        this.send(client.ws, { type: 'auth:error', error: 'Invalid auth token' });
      }
      return;
    }

    if (!client.uid) {
      this.send(client.ws, { type: 'error', error: 'Authenticate first' });
      return;
    }

    switch (msg.type) {
      case 'voice:join': {
        const roomId = Number(msg.roomId);
        if (!roomId) return;
        const requestedRole =
          msg.role === 'speaker' || msg.role === 'host' || msg.role === 'co_host'
            ? msg.role
            : 'listener';
        const isMuted = msg.isMuted !== undefined ? Boolean(msg.isMuted) : undefined;
        try {
          const updatedRoom = await joinVoiceRoomSession(roomId, client.uid, {
            requestedRole,
            isMuted,
          });
          client.activeVoiceRoomId = roomId;

          const meInRoom = updatedRoom?.participants.find((p) => p.uid === client.uid);

          this.broadcastToRoom(
            roomId,
            {
              type: 'voice:peer-joined',
              roomId,
              uid: client.uid,
              peerUid: client.uid,
              displayName: meInRoom?.displayName || client.displayName,
              avatarUrl: meInRoom?.avatarUrl || client.avatarUrl,
              role: meInRoom?.role || 'listener',
              seatNumber: meInRoom?.seatNumber || null,
              isMuted: meInRoom?.isMuted ?? true,
              isCameraOn: meInRoom?.isCameraOn ?? false,
              room: updatedRoom,
            },
            client.uid
          );

          this.send(client.ws, {
            type: 'voice:joined',
            roomId,
            room: updatedRoom,
            assignedRole: meInRoom?.role || 'listener',
            seatNumber: meInRoom?.seatNumber || null,
            peers: this.getRoomPeerUids(roomId).filter((u) => u !== client.uid),
          });

          this.broadcastAll({
            type: 'voice:room-summary',
            roomId,
            participantCount: updatedRoom?.participantCount || 0,
            speakerCount: updatedRoom?.speakerCount || 0,
            listenerCount: updatedRoom?.listenerCount || 0,
          });
        } catch (err: any) {
          this.send(client.ws, {
            type: 'voice:error',
            roomId,
            error: err?.message || 'Unable to join voice room.',
          });
        }
        break;
      }

      case 'voice:leave': {
        const roomId = client.activeVoiceRoomId || Number(msg.roomId);
        if (!roomId) return;
        client.activeVoiceRoomId = null;
        try {
          const updatedRoom = await leaveVoiceRoomSession(roomId, client.uid);
          this.broadcastToRoom(roomId, {
            type: 'voice:user-left',
            roomId,
            uid: client.uid,
            room: updatedRoom,
          });
          this.broadcastAll({
            type: 'voice:room-summary',
            roomId,
            participantCount: updatedRoom?.participantCount || 0,
            speakerCount: updatedRoom?.speakerCount || 0,
            listenerCount: updatedRoom?.listenerCount || 0,
          });
        } catch (err) {
          console.error('voice:leave error:', err);
        }
        break;
      }

      case 'voice:signal': {
        const targetUid = msg.targetUid || msg.toUid;
        const signalData = msg.signalData || msg.signal;
        if (!targetUid || !signalData || !client.activeVoiceRoomId) return;
        for (const target of this.clients) {
          if (
            target.uid === targetUid &&
            target.activeVoiceRoomId === client.activeVoiceRoomId
          ) {
            this.send(target.ws, {
              type: 'voice:signal',
              roomId: client.activeVoiceRoomId,
              fromUid: client.uid,
              signalData,
              signal: signalData,
            });
          }
        }
        break;
      }

      case 'voice:mute': {
        if (!client.activeVoiceRoomId) return;
        const roomId = client.activeVoiceRoomId;
        const isMuted = Boolean(msg.isMuted);
        try {
          const updated = await toggleVoiceRoomMute(roomId, client.uid, isMuted);
          this.broadcastToRoom(roomId, {
            type: 'voice:room-updated',
            roomId,
            room: updated,
          });
        } catch (err: any) {
          this.send(client.ws, {
            type: 'voice:error',
            roomId,
            error: err?.message || 'Unable to toggle microphone.',
          });
        }
        break;
      }

      case 'voice:camera': {
        if (!client.activeVoiceRoomId) return;
        const roomId = client.activeVoiceRoomId;
        const isCameraOn = Boolean(msg.isCameraOn);
        try {
          const updated = await toggleVoiceRoomCamera(roomId, client.uid, isCameraOn);
          this.broadcastToRoom(roomId, {
            type: 'voice:room-updated',
            roomId,
            room: updated,
          });
          this.broadcastToRoom(roomId, {
            type: 'voice:camera-changed',
            roomId,
            uid: client.uid,
            isCameraOn,
          });
        } catch (err: any) {
          this.send(client.ws, {
            type: 'voice:error',
            roomId,
            error: err?.message || 'Unable to toggle camera.',
          });
        }
        break;
      }

      case 'voice:speaking': {
        if (!client.activeVoiceRoomId) return;
        const activeSpeaking = Boolean(msg.speaking ?? msg.isSpeaking);
        this.broadcastToRoom(
          client.activeVoiceRoomId,
          {
            type: 'voice:speaking',
            roomId: client.activeVoiceRoomId,
            uid: client.uid,
            speaking: activeSpeaking,
            isSpeaking: activeSpeaking,
          },
          undefined
        );
        break;
      }

      case 'voice:typing': {
        if (!client.activeVoiceRoomId) return;
        this.broadcastToRoom(
          client.activeVoiceRoomId,
          {
            type: 'voice:typing',
            roomId: client.activeVoiceRoomId,
            uid: client.uid,
            username: msg.username || client.displayName,
            displayName: client.displayName,
            isTyping: Boolean(msg.isTyping),
          },
          client.uid
        );
        break;
      }

      case 'community_room:join': {
        const communityId = Number(msg.communityId);
        const roomSlug = String(msg.roomSlug || '').trim();
        if (!communityId || !roomSlug) return;
        client.activeCommunityId = communityId;
        client.activeCommunityRoomKey = `${communityId}:${roomSlug}`;
        const onlineCount = this.getChatRoomOnlineCount(communityId, roomSlug);
        this.broadcastToCommunityRoom(communityId, roomSlug, {
          type: 'community_room:presence',
          communityId,
          roomSlug,
          onlineCount,
        });
        break;
      }

      case 'community_room:leave': {
        const prevKey = client.activeCommunityRoomKey;
        client.activeCommunityRoomKey = null;
        if (prevKey) {
          const [cidStr, slug] = prevKey.split(':');
          const cid = Number(cidStr);
          if (cid && slug) {
            this.broadcastToCommunityRoom(cid, slug, {
              type: 'community_room:presence',
              communityId: cid,
              roomSlug: slug,
              onlineCount: this.getChatRoomOnlineCount(cid, slug),
            });
          }
        }
        break;
      }

      case 'community_room:typing': {
        const communityId = Number(msg.communityId);
        const roomSlug = String(msg.roomSlug || '').trim();
        if (!communityId || !roomSlug) return;
        this.broadcastToCommunityRoom(
          communityId,
          roomSlug,
          {
            type: 'community_room:typing',
            communityId,
            roomSlug,
            uid: client.uid,
            displayName: client.displayName,
            isTyping: Boolean(msg.isTyping),
          },
          client.uid
        );
        break;
      }

      case 'inbox:typing': {
        const conversationId = Number(msg.conversationId);
        const targetUids = Array.isArray(msg.targetUids) ? msg.targetUids : [];
        if (!conversationId || targetUids.length === 0) return;
        for (const tUid of targetUids.slice(0, 25)) {
          if (typeof tUid === 'string' && tUid !== client.uid) {
            this.sendToUser(tUid, {
              type: 'inbox:typing',
              conversationId,
              uid: client.uid,
              displayName: client.displayName,
              isTyping: Boolean(msg.isTyping),
            });
          }
        }
        break;
      }
    }
  }

  /**
   * Immediately ejects a kicked or banned user's active WebSocket sessions from the voice room
   * so they stop receiving room broadcasts and cannot relay WebRTC signals.
   */
  disconnectUserFromVoiceRoom(uid: string, roomId: number, notifyPayload?: unknown) {
    for (const c of this.clients) {
      if (c.uid === uid && c.activeVoiceRoomId === roomId) {
        if (notifyPayload) {
          this.send(c.ws, notifyPayload);
        }
        c.activeVoiceRoomId = null;
      } else if (c.uid === uid && notifyPayload) {
        this.send(c.ws, notifyPayload);
      }
    }
  }

  disconnectAllFromVoiceRoom(roomId: number, notifyPayload?: unknown) {
    for (const c of this.clients) {
      if (c.activeVoiceRoomId === roomId) {
        if (notifyPayload) {
          this.send(c.ws, notifyPayload);
        }
        c.activeVoiceRoomId = null;
      }
    }
  }

  getOnlineUserUids(): string[] {
    return Array.from(
      new Set(Array.from(this.clients).map((c) => c.uid).filter(Boolean))
    );
  }

  getRoomPeerUids(roomId: number): string[] {
    return Array.from(
      new Set(
        Array.from(this.clients)
          .filter((c) => c.activeVoiceRoomId === roomId && c.uid)
          .map((c) => c.uid)
      )
    );
  }

  getCommunityOnlineCount(communityId: number, memberUids?: string[]): number {
    const onlineSet = new Set(this.getOnlineUserUids());
    const activeInCommunity = new Set<string>();
    for (const c of this.clients) {
      if (c.activeCommunityId === communityId && c.uid) {
        activeInCommunity.add(c.uid);
      }
    }
    if (Array.isArray(memberUids)) {
      for (const mUid of memberUids) {
        if (onlineSet.has(mUid)) activeInCommunity.add(mUid);
      }
    }
    return activeInCommunity.size;
  }

  getChatRoomOnlineCount(communityId: number, roomSlug: string): number {
    const key = `${communityId}:${roomSlug}`;
    const uids = new Set<string>();
    for (const c of this.clients) {
      if (c.activeCommunityRoomKey === key && c.uid) {
        uids.add(c.uid);
      }
    }
    return uids.size;
  }

  broadcastToCommunityRoom(
    communityId: number,
    roomSlug: string,
    payload: unknown,
    excludeUid?: string
  ) {
    const key = `${communityId}:${roomSlug}`;
    for (const c of this.clients) {
      if (c.activeCommunityRoomKey === key && c.uid !== excludeUid) {
        this.send(c.ws, payload);
      }
    }
  }

  sendToUser(uid: string, payload: unknown) {
    for (const c of this.clients) {
      if (c.uid === uid) {
        this.send(c.ws, payload);
      }
    }
  }

  broadcastToRoom(roomId: number, payload: unknown, excludeUid?: string) {
    for (const c of this.clients) {
      if (c.activeVoiceRoomId === roomId && c.uid !== excludeUid) {
        this.send(c.ws, payload);
      }
    }
  }

  broadcastAll(payload: unknown) {
    for (const c of this.clients) {
      this.send(c.ws, payload);
    }
  }

  private send(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}

export const realtimeHub = new RealtimeHub();
