import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'MyDoc API',
      version: '0.1.0',
      description: 'API documentation for MyDoc backend services'
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'Default server'
      }
    ],
    tags: [
      { name: 'Health', description: 'Service health and metrics' },
      { name: 'Auth', description: 'Authentication and bootstrap' },
      { name: 'Consultations', description: 'Consultation lifecycle endpoints' },
      { name: 'Payments', description: 'Payment webhooks and processing' },
      { name: 'Webhooks', description: 'External provider callbacks' },
      { name: 'Doctors', description: 'Doctor domain endpoints' },
      { name: 'Patients', description: 'Patient domain endpoints' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: {}
          },
          example: {
            error: 'Validation error',
            details: { tier: ['Required'] }
          }
        },
        UserRole: {
          type: 'string',
          enum: ['PATIENT', 'DOCTOR', 'ADMIN']
        },
        PaymentStatus: {
          type: 'string',
          enum: ['HELD', 'CAPTURED', 'RELEASED', 'REFUNDED', 'FAILED']
        },
        UserSummary: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phoneNumber: { type: 'string' },
            role: { $ref: '#/components/schemas/UserRole' },
            tokenVersion: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            facePersonId: { type: 'string', nullable: true },
            voiceProfileId: { type: 'string', nullable: true },
            mfaEnabled: { type: 'boolean' },
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
            isActive: { type: 'boolean' }
          }
        },
        AuthTokens: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            refreshToken: { type: 'string' },
            refreshTokenExpiresAt: { type: 'string', format: 'date-time' }
          },
          required: ['token', 'refreshToken', 'refreshTokenExpiresAt']
        },
        AuthUserResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            refreshToken: { type: 'string' },
            refreshTokenExpiresAt: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/UserSummary' }
          }
        },
        AuthTokenUserIdResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            refreshToken: { type: 'string' },
            refreshTokenExpiresAt: { type: 'string', format: 'date-time' },
            userId: { type: 'string' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            refreshToken: { type: 'string' },
            refreshTokenExpiresAt: { type: 'string', format: 'date-time' },
            userId: { type: 'string' },
            role: { $ref: '#/components/schemas/UserRole' }
          }
        },
        RefreshTokenInput: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' }
          }
        },
        ChangePasswordInput: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', minLength: 8 },
            newPassword: { type: 'string', minLength: 8 }
          }
        },
        RegisterPatientInput: {
          type: 'object',
          required: ['email', 'phoneNumber', 'password', 'dateOfBirth'],
          properties: {
            email: { type: 'string', format: 'email' },
            phoneNumber: { type: 'string' },
            password: { type: 'string', minLength: 8 },
            dateOfBirth: { type: 'string', format: 'date' },
            bloodGroup: { type: 'string' },
            allergies: {
              type: 'array',
              items: { type: 'string' }
            },
            chronicConditions: {
              type: 'array',
              items: { type: 'string' }
            },
            emergencyName: { type: 'string' },
            emergencyPhone: { type: 'string' }
          }
        },
        RegisterDoctorInput: {
          type: 'object',
          required: ['email', 'phoneNumber', 'password', 'mdcnNumber', 'specialization', 'yearsOfExperience'],
          properties: {
            email: { type: 'string', format: 'email' },
            phoneNumber: { type: 'string' },
            password: { type: 'string', minLength: 8 },
            mdcnNumber: { type: 'string' },
            specialization: { type: 'string' },
            yearsOfExperience: { type: 'integer' },
            verifiedAt: { type: 'string', format: 'date-time' },
            canHandleVoiceText: { type: 'boolean' },
            canHandleVoiceCall: { type: 'boolean' },
            canHandleVideoCall: { type: 'boolean' }
          }
        },
        LoginInput: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 }
          }
        },
        DevBootstrapInput: {
          type: 'object',
          required: ['email', 'phoneNumber'],
          properties: {
            email: { type: 'string', format: 'email' },
            phoneNumber: { type: 'string' },
            role: { $ref: '#/components/schemas/UserRole' }
          }
        },
        DoctorProfileInput: {
          type: 'object',
          required: ['mdcnNumber', 'specialization', 'yearsOfExperience'],
          properties: {
            mdcnNumber: { type: 'string' },
            specialization: { type: 'string' },
            yearsOfExperience: { type: 'integer' },
            verifiedAt: { type: 'string', format: 'date-time' },
            canHandleVoiceText: { type: 'boolean' },
            canHandleVoiceCall: { type: 'boolean' },
            canHandleVideoCall: { type: 'boolean' }
          }
        },
        DoctorPresenceInput: {
          type: 'object',
          properties: {
            canHandleVoiceText: { type: 'boolean' },
            canHandleVoiceCall: { type: 'boolean' },
            canHandleVideoCall: { type: 'boolean' }
          }
        },
        DoctorProfileRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            mdcnNumber: { type: 'string' },
            specialization: { type: 'string' },
            yearsOfExperience: { type: 'integer' },
            verifiedAt: { type: 'string', format: 'date-time' },
            currentTier: {
              type: 'string',
              enum: ['VOICE_TEXT_ONLY', 'VOICE_CALL_ENABLED', 'VIDEO_CALL_ENABLED']
            },
            canHandleVoiceText: { type: 'boolean' },
            canHandleVoiceCall: { type: 'boolean' },
            canHandleVideoCall: { type: 'boolean' },
            deviceVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
            videoQualityPassed: { type: 'boolean' },
            isOnline: { type: 'boolean' },
            lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
            totalConsultations: { type: 'integer' },
            averageRating: { type: 'number' },
            acceptanceRate: { type: 'number' }
          }
        },
        PatientProfileInput: {
          type: 'object',
          required: ['dateOfBirth'],
          properties: {
            dateOfBirth: { type: 'string', format: 'date' },
            bloodGroup: { type: 'string' },
            allergies: {
              type: 'array',
              items: { type: 'string' }
            },
            chronicConditions: {
              type: 'array',
              items: { type: 'string' }
            },
            emergencyName: { type: 'string' },
            emergencyPhone: { type: 'string' }
          }
        },
        PatientProfileRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            dateOfBirth: { type: 'string', format: 'date-time' },
            bloodGroup: { type: 'string', nullable: true },
            allergies: {
              type: 'array',
              items: { type: 'string' }
            },
            chronicConditions: {
              type: 'array',
              items: { type: 'string' }
            },
            emergencyName: { type: 'string', nullable: true },
            emergencyPhone: { type: 'string', nullable: true }
          }
        },
        BankDetailsInput: {
          type: 'object',
          required: ['accountName', 'accountNumber', 'bankCode'],
          properties: {
            accountName: { type: 'string' },
            accountNumber: { type: 'string' },
            bankCode: { type: 'string' }
          }
        },
        WalletRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            balance: { type: 'number' },
            currency: { type: 'string' },
            metadata: {
              type: 'object',
              additionalProperties: true,
              nullable: true
            },
            dailyWithdrawalLimit: { type: 'number' },
            lastWithdrawalAt: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        WalletUpdateResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            walletId: { type: 'string' }
          }
        },
        ProfileUpdateResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            profileId: { type: 'string' }
          }
        },
        ConsultationTier: {
          type: 'string',
          enum: ['NORMAL', 'PRIORITY', 'SUPER']
        },
        ConsultationStatus: {
          type: 'string',
          enum: [
            'REQUESTED',
            'DOCTOR_ACCEPTED',
            'IN_PROGRESS',
            'COMPLETED',
            'EXPIRED',
            'CANCELLED'
          ]
        },
        CommunicationSession: {
          type: 'object',
          properties: {
            callId: { type: 'string' },
            threadId: { type: 'string' },
            patient: {
              type: 'object',
              properties: {
                acsUserId: { type: 'string' },
                token: { type: 'string' },
                expiresOn: { type: 'string', format: 'date-time' }
              }
            },
            doctor: {
              type: 'object',
              properties: {
                acsUserId: { type: 'string' },
                token: { type: 'string' },
                expiresOn: { type: 'string', format: 'date-time' }
              }
            }
          },
          additionalProperties: true
        },
        ConsultationRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            tier: { $ref: '#/components/schemas/ConsultationTier' },
            status: { $ref: '#/components/schemas/ConsultationStatus' },
            patientId: { type: 'string' },
            doctorId: { type: 'string', nullable: true },
            price: { type: 'number' },
            paymentStatus: { $ref: '#/components/schemas/PaymentStatus' },
            paymentReference: { type: 'string', nullable: true },
            symptomsVoiceNote: { type: 'string', nullable: true },
            requestedAt: { type: 'string', format: 'date-time' },
            acceptedAt: { type: 'string', format: 'date-time', nullable: true },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            expiryTime: { type: 'string', format: 'date-time' },
            expiryNotifiedAt: { type: 'string', format: 'date-time', nullable: true },
            livenessRequestedAt: { type: 'string', format: 'date-time', nullable: true }
          },
          additionalProperties: true
        },
        RequestConsultationInput: {
          type: 'object',
          required: ['tier'],
          properties: {
            tier: { $ref: '#/components/schemas/ConsultationTier' },
            symptomsVoiceNote: { type: 'string' },
            preferredDoctorId: { type: 'string' },
            metadata: {
              type: 'object',
              properties: {
                deviceInfo: { type: 'object', additionalProperties: true },
                networkType: { type: 'string' }
              }
            }
          },
          example: {
            tier: 'PRIORITY',
            symptomsVoiceNote: 'https://cdn.mydoc.app/voice/abc123.m4a',
            metadata: { networkType: '4G', deviceInfo: { model: 'iPhone 15' } }
          }
        },
        AcceptConsultationInput: {
          type: 'object',
          required: ['requestId'],
          properties: {
            requestId: { type: 'string' }
          },
          example: {
            requestId: 'cm0a1b2c3d4e5'
          }
        },
        CompleteConsultationInput: {
          type: 'object',
          properties: {
            diagnosis: { type: 'string' },
            prescription: { type: 'string' }
          },
          example: {
            diagnosis: 'Acute upper respiratory infection',
            prescription: 'Azithromycin 500mg once daily for 3 days'
          }
        },
        RateDoctorInput: {
          type: 'object',
          required: ['rating'],
          properties: {
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            review: { type: 'string', maxLength: 2000 }
          },
          example: {
            rating: 5,
            review: 'Very thorough consultation and clear instructions.'
          }
        },
        EscalateTierInput: {
          type: 'object',
          required: ['toTier'],
          properties: {
            toTier: {
              type: 'string',
              enum: ['PRIORITY', 'SUPER']
            }
          },
          example: {
            toTier: 'SUPER'
          }
        },
        ConsultationRequestResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            consultationId: { type: 'string' },
            tier: { $ref: '#/components/schemas/ConsultationTier' },
            price: { type: 'number' },
            expiresAt: { type: 'string', format: 'date-time' }
          },
          example: {
            message: 'Consultation requested successfully',
            consultationId: 'cm0a1b2c3d4e5',
            tier: 'PRIORITY',
            price: 5000,
            expiresAt: '2026-02-23T21:00:00.000Z'
          }
        },
        AcceptConsultationResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            consultationId: { type: 'string' },
            status: { $ref: '#/components/schemas/ConsultationStatus' },
            communicationSession: {
              $ref: '#/components/schemas/CommunicationSession'
            }
          },
          example: {
            message: 'Consultation accepted successfully',
            consultationId: 'cm0a1b2c3d4e5',
            status: 'DOCTOR_ACCEPTED'
          }
        },
        StartConsultationResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            status: { $ref: '#/components/schemas/ConsultationStatus' }
          },
          example: {
            message: 'Consultation started',
            status: 'IN_PROGRESS'
          }
        },
        CompleteConsultationResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            consultationId: { type: 'string' }
          },
          example: {
            message: 'Consultation completed',
            consultationId: 'cm0a1b2c3d4e5'
          }
        },
        EscalateTierResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            consultationId: { type: 'string' },
            fromTier: { $ref: '#/components/schemas/ConsultationTier' },
            toTier: { $ref: '#/components/schemas/ConsultationTier' },
            extraAmount: { type: 'number' }
          },
          example: {
            message: 'Consultation tier escalated',
            consultationId: 'cm0a1b2c3d4e5',
            fromTier: 'NORMAL',
            toTier: 'PRIORITY',
            extraAmount: 4000
          }
        },
        ConsultationHistoryResponse: {
          type: 'object',
          properties: {
            consultations: {
              type: 'array',
              items: { $ref: '#/components/schemas/ConsultationRecord' }
            }
          },
          example: {
            consultations: [
              {
                id: 'cm0a1b2c3d4e5',
                tier: 'NORMAL',
                status: 'COMPLETED',
                patientId: 'pat_123',
                doctorId: 'doc_456',
                price: 1000
              }
            ]
          }
        },
        ConsultationDetailsResponse: {
          $ref: '#/components/schemas/ConsultationRecord'
        },
        WebhookReceivedResponse: {
          type: 'object',
          properties: {
            received: { type: 'boolean' }
          },
          example: { received: true }
        },
        AcsWebhookProcessedResponse: {
          type: 'object',
          properties: {
            processed: { type: 'integer' }
          },
          example: { processed: 1 }
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            checks: {
              type: 'object',
              additionalProperties: true
            }
          },
          additionalProperties: true,
          example: {
            status: 'healthy',
            timestamp: '2026-02-23T20:35:00.000Z',
            checks: {
              database: 'ok',
              redis: 'ok'
            }
          }
        },
        MetricsResponse: {
          type: 'object',
          additionalProperties: true,
          example: {
            uptimeSeconds: 12345,
            memory: { rss: 120586240, heapUsed: 42897408 },
            activeConsultations: 12
          }
        },
        GenericMessageResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          example: {
            message: 'Doctor rated successfully'
          }
        }
      }
    }
  },
  apis: [
    path.resolve(__dirname, '../routes/*.ts'),
    path.resolve(__dirname, '../routes/*.js'),
    path.resolve(__dirname, '../index.ts'),
    path.resolve(__dirname, '../index.js')
  ]
};

export const swaggerSpec = swaggerJsdoc(options);
