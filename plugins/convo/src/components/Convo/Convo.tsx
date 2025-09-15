import React, { useEffect, useRef, useState } from 'react';
import {
  useApi,
  fetchApiRef,
  configApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import { Content, Page } from '@backstage/core-components';
import Chatbot, {
  ChatbotDisplayMode,
} from '@patternfly/chatbot/dist/dynamic/Chatbot';
import MessageBox from '@patternfly/chatbot/dist/dynamic/MessageBox';
import Message from '@patternfly/chatbot/dist/dynamic/Message';
import { DropdownItem } from '@patternfly/react-core';
import ConvoAvatar from '../../../static/robot.svg';

import { ConvoFooter } from '../ConvoFooter/ConvoFooter';
import { ConvoHeader } from '../ConvoHeader/ConvoHeader';
import { Conversation } from '../Conversation/Conversation';
import { ChatbotConversationHistoryNav } from '@patternfly/chatbot/dist/dynamic/ChatbotConversationHistoryNav';
import { WelcomeMessages } from '../WelcomeMessages/WelcomeMessages';
import { AssistantIntroduction } from '../AssistantIntroduction/AssistantIntroduction';
import { humanizeAssistantName } from '../../lib/helpers';

import { customStyles } from '../../lib/styles';
import { getAssistants, sendUserQuery, getConversations, deleteConversation } from '../../lib/api';

// Style imports needed for the virtual assistant component
import '@patternfly/react-core/dist/styles/base.css';
import '@patternfly/chatbot/dist/css/main.css';

import { UserEntity } from '@backstage/catalog-model';

// CSS Overrides to make PF components look normal in Backstage
const useStyles = makeStyles(theme => customStyles(theme));

const BOT = 'ai';
const USER = 'human';

// Define types for conversation messages
interface ConversationMessage {
  text: string;
  sender: typeof USER | typeof BOT;
  done: boolean;
  search_metadata?: any;
  interactionId?: string | boolean;
}

export const Convo = () => {
  // Constants
  const classes = useStyles();
  const config = useApi(configApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const theme = useTheme();

  interface ConversationItem {
    id: string;
    text: string;
    payload: ConversationMessage[];
    sessionId?: string;
    assistant_name?: string;
    menuItems?: React.ReactNode[];
    onSelect?: (event?: React.MouseEvent, value?: string | number) => void;
  }

  // State
  const [_userInputMessage, setUserInputMessage] = useState<string>('');
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [assistantsLoading, setAssistantsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [assistants, setAssistants] = useState<any>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<any>({});
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [assistantHasBeenSelected, setAssistantHasBeenSelected] =
    useState<boolean>(false);
  const [responseIsStreaming, setResponseIsStreaming] =
    useState<boolean>(false);
  const [showAssistantIntroduction, setShowAssistantIntroduction] =
    useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>(crypto.randomUUID());
  const [user, setUser] = useState<UserEntity>({} as UserEntity);
  const [userId, setUserId] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [shouldRefreshConversations, setShouldRefreshConversations] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [pendingAssistantName, setPendingAssistantName] = useState<string>('');
  const abortControllerRef = useRef(new AbortController());

  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const catalogApi = useApi(catalogApiRef);

  // Create a stable delete handler to avoid recreating functions
  const handleDeleteConversation = React.useCallback((conversationSessionId: string) => {
    
    if (!userId) {
      console.error('Cannot delete conversation: userId is not available');
      return;
    }
    
    if (!conversationSessionId) {
      console.error('Cannot delete conversation: sessionId missing');
      return;
    }
    
    // Call the delete API
    deleteConversation(
      backendUrl,
      fetchApi.fetch,
      userId,
      conversationSessionId,
      (response) => {
        if (response.error) {
          console.error('Error deleting conversation:', response.error);
          setError(true);
        } else {
          
          // If the deleted conversation was the active one, clear the current conversation
          if (conversationSessionId === sessionId) {
            setConversation([]);
            setSessionId(crypto.randomUUID());
            setShowAssistantIntroduction(false);
            setAssistantHasBeenSelected(false);
            setPendingAssistantName('');
          }
          
          // Refresh the conversation list
          setShouldRefreshConversations(true);
        }
      }
    );
  }, [backendUrl, fetchApi.fetch, userId, sessionId]);

  useEffect(() => {
    const handleLinkClick = (event: Event) => {
      const link = (event.target as HTMLElement).closest('a'); // Matches any <a> element
      if (link) {
        event.preventDefault();
        window.open(link.href, '_blank', 'noopener,noreferrer');
      }
    };

    document.addEventListener('click', handleLinkClick);
    return () => {
      document.removeEventListener('click', handleLinkClick);
    };
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      const { userEntityRef } = await identityApi.getBackstageIdentity();
      const userEntity = (await catalogApi.getEntityByRef(
        userEntityRef,
      )) as UserEntity;
      setUser(userEntity);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (user?.spec?.profile?.displayName) {
      setFirstName(user.spec.profile.displayName.split(' ')[0]);
    } else {
      setFirstName('');
    }
    // Use email as userId if available, otherwise use uid, fallback to empty string
    if (user?.spec?.profile?.email) {
      setUserId(user.spec.profile.email);
    } else if (user?.metadata?.uid) {
      setUserId(user.metadata.uid);
    } else {
      setUserId('');
    }
  }, [user]);

  useEffect(() => {
    const currentTheme = theme.palette.type;
    setIsDarkMode(currentTheme === 'dark');
  }, [theme]);

  React.useEffect(() => {
    const htmlTagElement = document.documentElement;
    const THEME_DARK_CLASS = 'pf-v6-theme-dark';
    if (isDarkMode) {
      htmlTagElement.classList.add(THEME_DARK_CLASS);
    } else {
      htmlTagElement.classList.remove(THEME_DARK_CLASS);
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (assistants.length !== 0) {
      return;
    }
    getAssistants(
      backendUrl,
      fetchApi.fetch,
      setAssistants,
      setSelectedAssistant,
      setError,
      setAssistantsLoading, // Use assistantsLoading instead of general loading
      setResponseIsStreaming,
    );
  }, [assistants, backendUrl, fetchApi.fetch]);

  // Handle setting assistant when assistants load and there's a pending selection
  useEffect(() => {
    if (pendingAssistantName && assistants.length > 0) {
      const matchingAssistant = assistants.find((assistant: any) => 
        assistant.name === pendingAssistantName
      );
      
      if (matchingAssistant) {
        setSelectedAssistant(matchingAssistant);
        setAssistantHasBeenSelected(true);
        setPendingAssistantName(''); // Clear pending state
        console.log('Set assistant from pending selection:', pendingAssistantName);
      } else {
        console.log('Pending assistant not found:', pendingAssistantName);
        setPendingAssistantName(''); // Clear invalid pending state
      }
    }
  }, [assistants, pendingAssistantName]);

    // Fetch conversations from the backend
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        getConversations(
          backendUrl,
          fetchApi.fetch,
          (rawConversations: ConversationItem[]) => {
            // Add menu items to each conversation
            const conversationsWithMenus = rawConversations.map((conv) => {
              return {
                ...conv,
                menuItems: [
                  <DropdownItem 
                    key="delete" 
                    style={{ color: 'var(--pf-v5-global--danger-color--100)' }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (conv.sessionId) {
                        handleDeleteConversation(conv.sessionId);
                      } else {
                        console.error('Cannot delete conversation: sessionId is missing');
                      }
                    }}
                  >
                    Delete conversation
                  </DropdownItem>
                ]
              };
            });
            setConversations(conversationsWithMenus);
          },
          setError,
          setLoading,
          userId,
        );
      } catch (error) {
        console.error('Error fetching conversations:', error);
        setError(true);
        setLoading(false);
      }
    };
    
    // Only fetch conversations when we have a userId and either:
    // - shouldRefreshConversations is true, OR
    // - sidebarOpen is true (drawer is opening)
    if (userId && (shouldRefreshConversations || sidebarOpen)) {
      fetchConversations();
      // Reset the refresh flag after fetching
      if (shouldRefreshConversations) {
        setShouldRefreshConversations(false);
      }
    }
  }, [userId, backendUrl, fetchApi.fetch, shouldRefreshConversations, sidebarOpen, handleDeleteConversation]);

  // Whenever the conversation changes,
  // If the last message in the conversation is from the user and the bot is not typing, send the user query
  useEffect(() => {
    if (
      conversation.length > 0 &&
      conversation[conversation.length - 1].sender === USER &&
      !loading &&
      !responseIsStreaming
    ) {
      console.log('Sending user query');
      const lastMessage = conversation[conversation.length - 1];
      const previousMessages = conversation.slice(0, conversation.length - 1);
      try {
        sendUserQuery(
          backendUrl,
          fetchApi.fetch,
          selectedAssistant.id,
          lastMessage.text,
          previousMessages,
          setLoading,
          setError,
          setResponseIsStreaming,
          handleError,
          updateConversation,
          sessionId,
          abortControllerRef.current.signal,
          userId,
        );
      } catch (error) {
        console.log('Error sending user query:', error);
      }
    }
  }, [conversation, loading, responseIsStreaming, backendUrl, fetchApi.fetch, selectedAssistant.id, sessionId, userId]);

  // If we are loading, clear the user input message
  useEffect(() => {
    if (loading) {
      setUserInputMessage('');
    }
  }, [loading]);

  // If the conversation changes, scroll to the bottom of the message box
  useEffect(() => {
    const messageBox = document.querySelector('.pf-chatbot__messagebox');
    if (messageBox) {
      messageBox.scrollTo({ top: messageBox.scrollHeight, behavior: 'smooth' });
    }
  }, [conversation.length]);



  const updateConversation = (text_content: string, search_metadata: any) => {
    setConversation(prevMessages => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      if (!lastMessage) {
        return prevMessages;
      }

      // If the last message is from the user we need to create a new bot message
      // and we put the text content in the message.
      // In a streaming response this handles the first returned chunk
      if (lastMessage.sender !== BOT) {
        const newMessage: ConversationMessage = {
          sender: BOT,
          text: text_content,
          done: false,
          //We wont know the interaction ID until we get the last chunk
          interactionId: false,
        };
        return [...prevMessages, newMessage];
      }

      //If we haven't tripped the above conditional we are in a streaming response
      // and we need to update the last message with the new text content
      const updatedMessages = [...prevMessages];

      // If we have text content we need to update the last message
      if (text_content) {
        updatedMessages[updatedMessages.length - 1].text += text_content;
      }

      // If we have search metadata we need to update the last message
      // and set the done flag to true
      if (search_metadata && search_metadata.length > 0) {
        updatedMessages[updatedMessages.length - 1].search_metadata =
          search_metadata;
        updatedMessages[updatedMessages.length - 1].done = true;
        updatedMessages[updatedMessages.length - 1].interactionId =
          search_metadata[0].interactionId;
        
        // Trigger conversation list refresh when streaming is complete
        setShouldRefreshConversations(true);
      }

      return updatedMessages;
    });
    return true;
  };

  const handleError = (error: Error) => {
    setError(true);
    setResponseIsStreaming(false);
    setLoading(false);
    console.error(error.message);
  };

  const sendMessageHandler = React.useCallback((msg: string) => {
    console.log('sendMessageHandler called with msg:', msg);
    // Guard against sending messages when assistants are still loading
    if (assistantsLoading || !selectedAssistant.id) {
      return;
    }
    
    // Cancel any ongoing requests (like assistant introduction) to prevent concurrent responses
    recycleAbortController();
    
    // Hide assistant introduction if it's showing since user is sending a message
    setShowAssistantIntroduction(false);
    
    setUserInputMessage('');
    const conversationEntry: ConversationMessage = {
      text: msg,
      sender: USER,
      done: false,
    };
    setConversation(prevConversation => [...prevConversation, conversationEntry]);
    setAssistantHasBeenSelected(true);
  }, [assistantsLoading, selectedAssistant.id]);

  const ShowErrorMessage = () => {
    if (error) {
      return (
        <Content>
          😿 Something went wrong talking Convo's brain. Try back later.
        </Content>
      );
    }
    return null;
  };

  const ShowLoadingMessage = () => {
    // Don't show regular loading message when assistants are loading
    if (loading && !assistantsLoading) {
      return (
        <Message
          name={humanizeAssistantName(selectedAssistant.name)}
          role="bot"
          avatar={ConvoAvatar}
          timestamp=" "
          isLoading
        />
      );
    }
    return null;
  };

  const recycleAbortController = () => {
    // Abort previous request
    abortControllerRef.current.abort();
    // Create a new abort controller for the new session
    abortControllerRef.current = new AbortController();
  };

  const assistantSelectionHandler = (assistant: any) => {
    recycleAbortController();
    setSelectedAssistant(assistant);
    setConversation([]);
    setError(false);
    setLoading(false);
    setResponseIsStreaming(false);
    setAssistantHasBeenSelected(true);
    setShowAssistantIntroduction(true);
    setSessionId(crypto.randomUUID());
  };

  const handleNewChatClick = (conversation: ConversationMessage[]) => {
    recycleAbortController();
    setConversation(conversation);
    setError(false);
    setLoading(false);
    setResponseIsStreaming(false);
    setShowAssistantIntroduction(false);
    setSessionId(crypto.randomUUID());
  };

  const handleConversationSelect = (_event?: React.MouseEvent, itemId?: string | number) => {
    
    if (itemId !== undefined && Array.isArray(conversations)) {
      // Find conversation by id in the conversations array
      const selectedConversation = conversations.find((conv: ConversationItem) => {
        const idMatch = conv.id.toString() === itemId?.toString();
        return idMatch;
      });
      
      if (selectedConversation) {
        recycleAbortController();
        // Validate payload is an array before setting conversation
        const payload = selectedConversation.payload;
        if (Array.isArray(payload)) {
          setConversation(payload);
        } else {
          console.warn('Invalid conversation payload, starting with empty conversation:', payload);
          setConversation([]);
        }
        setError(false);
        setLoading(false);
        setResponseIsStreaming(false);
        setShowAssistantIntroduction(false);
        // Ensure we have a valid sessionId - if not from conversation, it's a critical error
        if (selectedConversation.sessionId) {
          setSessionId(selectedConversation.sessionId);
        } else {
          console.error('Selected conversation missing sessionId, creating new session');
          setSessionId(crypto.randomUUID());
        }
        setSidebarOpen(false); // Close sidebar after selection

        // Set the correct assistant if available in the conversation data
        // Look for assistant_name in the conversation data (from the API response)
        if (selectedConversation.assistant_name) {
          // Wait for assistants to load if they haven't already
          if (assistants.length > 0) {
            const matchingAssistant = assistants.find((assistant: any) => 
              assistant.name === selectedConversation.assistant_name
            );
            
            if (matchingAssistant) {
              setSelectedAssistant(matchingAssistant);
              setAssistantHasBeenSelected(true);
              setPendingAssistantName(''); // Clear any pending state
            } else {
              console.log('Assistant not found by name:', selectedConversation.assistant_name, 'using current assistant');
              // Keep the currently selected assistant if the specific one isn't found
            }
          } else {
            // Assistants haven't loaded yet, set pending state to handle later
            setPendingAssistantName(selectedConversation.assistant_name);
            console.log('Assistants not loaded yet, setting pending assistant:', selectedConversation.assistant_name);
          }
        } else {
          // Clear any pending assistant state if no assistant specified
          setPendingAssistantName('');
        }
      } else {
        console.log('Conversation not found for itemId:', itemId, 'conversations:', conversations);
      }
    } else {
      console.log('Invalid itemId or conversations array:', { itemId, conversations });
    }
  };

  const handleSearchInputChange = (value: string) => {
    setSearchTerm(value);
  };

  // Filter conversations based on search term
  const filteredConversations = conversations.filter((conv: ConversationItem) => {
    if (!searchTerm.trim()) {
      return true; // Show all conversations if no search term
    }
    return conv.text.toLowerCase().includes(searchTerm.toLowerCase());
  });
  return (
    <Page themeId="tool">
      <Content className={classes.container}>
        <Chatbot displayMode={ChatbotDisplayMode.embedded}>
          <ChatbotConversationHistoryNav
            isDrawerOpen={sidebarOpen}
            conversations={filteredConversations}
            onDrawerToggle={() => setSidebarOpen(!sidebarOpen)}
            setIsDrawerOpen={setSidebarOpen}
            onSelectActiveItem={handleConversationSelect}
            displayMode={ChatbotDisplayMode.default}
            handleTextInputChange={handleSearchInputChange}
            searchInputPlaceholder="Search conversations..."
            searchInputAriaLabel="Search through conversation history"

            drawerContent={
              <>
                <ConvoHeader
                  onAssistantSelect={assistantSelectionHandler}
                  onNewChatClick={handleNewChatClick}
                  assistants={assistants}
                  selectedAssistant={selectedAssistant}
                  loading={loading || assistantsLoading}
                  setSidebarOpen={setSidebarOpen}
                  sidebarOpen={sidebarOpen}
                />
                <MessageBox
                  className={`${classes.messagebox} ${classes.userMessageText} `}
                  style={{ justifyContent: 'flex-end' }}
                  announcement="Type your message and hit enter to send"
                >
                  <WelcomeMessages
                    show={!assistantHasBeenSelected && !assistantsLoading}
                    sendMessageHandler={sendMessageHandler}
                    firstName={firstName}
                  />
                  <AssistantIntroduction
                    assistant={selectedAssistant}
                    backendUrl={backendUrl}
                    assistantHasBeenSelected={assistantHasBeenSelected}
                    show={showAssistantIntroduction}
                    sessionId={sessionId}
                    abortControllerRef={abortControllerRef}
                    userId={userId}
                  />
                  <Conversation
                    conversation={conversation}
                    assistant={selectedAssistant}
                  />
                  <ShowLoadingMessage />
                  <ShowErrorMessage />
                </MessageBox>
                <ConvoFooter
                  sendMessageHandler={sendMessageHandler}
                  responseIsStreaming={responseIsStreaming}
                  disabled={assistantsLoading || !selectedAssistant.id}
                  assistantsLoading={assistantsLoading}
                />
              </>
            }
          />
        </Chatbot>
      </Content>
    </Page>
  );
};
